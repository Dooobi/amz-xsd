const fs = require('fs');
const cheerio = require('cheerio');
const clone = require('clone');
const builtInDatatypes = require('./built-in-datatypes.js');

class XsdParser {

    constructor (schemaLocation) {
        this.schemaLocation = schemaLocation;

        this.includes = {};
        this.elements = {};
        this.types = {};

        this.elementCache = {};
        this.typeCache = clone(builtInDatatypes);

        this.fileContent = fs.readFileSync(this.schemaLocation, "utf8");

        this.$ = cheerio.load(
            this.fileContent,
            {
                xmlMode: true
            }
        );

        // For debugging
        this.notHandledTags = [];
        this.builtInTypes = [];
    }

    parseSelection (query, { withIncludes = true }) {
        let result = [];
        
        let queryElements = this.$(query);
        queryElements.each((i, queryElement) => {
            let parsedElement = this.parseSingleElement(this.$(queryElement));
            result.push(parsedElement);
        });

        if (withIncludes) {
            for (let includeName in this.includes) {
                let include = this.includes[includeName];
                result = [...result, ...include.parser.parseSelection(query, { withIncludes: withIncludes })];
            }
        }

        return result;
    }

    parse () {
        this.includes = this.parseIncludes();

        let root = this.$.root();
        this.parseDescendantsRecursive(root);

        console.log("done parsing.");
    }

    parseIncludes () {
        let includeTags = this.$("xsd\\:include");
        let includes = {};

        for (let i = 0; i < includeTags.length; i++) {
            let includeTag = includeTags[i];
            let schemaLocation = this.$(includeTag).attr('schemaLocation');
            let xsdParser = new XsdParser(schemaLocation);

            includes[schemaLocation] = {
                schemaLocation: schemaLocation,
                parser: xsdParser
            };

            xsdParser.parse();

            // Copy all elements and types from the includes to this parser
            Object.assign(this.elements, xsdParser.elements);
            Object.assign(this.types, xsdParser.types);

            // Merge the notHandledTags arrays and remove duplicates
            this.notHandledTags = [...new Set([...this.notHandledTags, ...xsdParser.notHandledTags])];
            // Merge the baseType arrays and remove duplicates
            this.builtInTypes = [...new Set([...this.builtInTypes, ...xsdParser.builtInTypes])];
        }

        return includes;
    }

    parseDescendantsRecursive (element) {
        let children = element.children();
        
        this.parseSingleElement(element);

        for (let i = 0; i < children.length; i++) {
            this.parseDescendantsRecursive(this.$(children[i]));
        }
    }

    parseSingleElement (element) {
        let parsedElement;
        let tagName = element.get(0).tagName;

        /* Collect built-in types for debugging */
        let type = element.attr('base') || element.attr('type');

        if (type && type.startsWith('xsd:')) {
            if (this.builtInTypes.indexOf(type) < 0) {
                this.builtInTypes.push(type);
            }
        }
        /* --------------- */

        switch (tagName) {
            case 'xsd:element':
                parsedElement = this.parseElement(element);
                break;
            case 'xsd:simpleType':
            case 'xsd:complexType':
                // let typeTag = this.parseTypeTag(element);
                // if (typeTag.name) {
                //     this.types[typeTag.name] = typeTag;
                // }
                // break;
            case 'root':
            case 'xsd:schema':
            case 'xsd:include':
                // These tags don't need to be handled
                break;
            default:
                // Remember not handled tags for debugging
                let ascendantTagNames = this.getAscendantsRecursive(element)
                    .map(el => {
                        if (el.get)
                            return el.get(0).tagName;
                        else
                            return el.tagName;
                    });

                let tagPath = ascendantTagNames.join(',');

                if (this.notHandledTags.indexOf(tagPath) < 0) {
                    this.notHandledTags.push(tagPath);
                }
        }

        return parsedElement;
    }

    getAscendantsRecursive (element) {
        let ascendants = [element];

        if (element.parent().length > 0
            && element.get(0).tagName !== 'xsd:element') {
            return ascendants.concat(this.getAscendantsRecursive(element.parent()));
        }

        return ascendants;
    }

    queryWithIncludes (queryString) {
        let result = this.$(queryString);

        if (result.length === 0) {
            for (let includeName in this.includes) {
                let include = this.includes[includeName];
                result = include.parser.$(queryString);
                if (result.length > 0) {
                    return result;
                }
            }
        }

        return result;
    }

    parseElement (xsdElement) {
        let element = {
            originalElement: xsdElement
        };
        let name = xsdElement.attr("name");
        let ref = xsdElement.attr("ref");
        let type = xsdElement.attr("type");

        // Try to get element from cache
        let cachedElement = this.elementCache[name] || this.elementCache[ref];
        if (cachedElement) {
            return cachedElement;
        }
        
        if (ref) {
            let referencedElement = this.queryWithIncludes(`xsd\\:element[name=${ref.replace(":", "\\:")}]`); // what if result is empty? (length=0)
            return this.parseElement(referencedElement);
        }

        // Get type of element
        if (type) {
            let cachedType = this.typeCache[type];
            if (cachedType) {
                element.type = cachedType;
            } else {
                if (this.schemaLocation === "Beauty.xsd" && type === "StringNotNull") {
                    console.log("here");
                }
                let referencedType = this.queryWithIncludes(`xsd\\:complexType[name=${type.replace(":", "\\:")}]`);
                if (referencedType.length > 0) {
                    element.type = this.parseComplexType(this.$(referencedType[0]));
                } else {
                    referencedType = this.queryWithIncludes(`xsd\\:simpleType[name=${type.replace(":", "\\:")}]`);
                    if (referencedType.length > 0) {
                        element.type = this.parseSimpleType(this.$(referencedType[0]));
                    }
                }
            }
            element.typeName = type;
        } else {
            let innerType = xsdElement.children('xsd\\:complexType');
            if (innerType.length > 0) {
                element.type = this.parseComplexType(this.$(innerType[0]));
            } else {
                innerType = xsdElement.children('xsd\\:simpleType');
                if (innerType.length > 0) {
                    element.type = this.parseSimpleType(this.$(innerType));
                }
            }
        }

        // Check if valid
        if (!element.type) {
            throw new Error(`Couldn't find type '${type}' for element with name '${name}'.`);
        }

        element.name = name;
        element.sourceSchema = this.schemaLocation;
        if (name) {
            this.elementCache[name] = element;
        }
        return element;
    }

    /**
     * Ignored children: complexContent, attribute
     */
    parseComplexType (xsdComplexType) {
        let type = {
            originalElement: xsdComplexType
        };
        let name = xsdComplexType.attr('name');
        let simpleContent = xsdComplexType.children('xsd\\:simpleContent');
        let sequence = xsdComplexType.children('xsd\\:sequence');
        let choice = xsdComplexType.children('xsd\\:choice');

        // Try to get type from cache
        let cachedType = this.typeCache[name];
        if (cachedType) {
            return cachedType;
        }

        if (choice.length > 0) {
            type.choiceElements = [];
            let choiceElements = choice.children('xsd\\:element');
            for (let i = 0; i < choiceElements.length; i++) {
                let choiceElement = this.parseElement(this.$(choiceElements[i]));
                type.choiceElements.push(choiceElement);
            }
        }
        if (sequence.length > 0) {
            type.sequenceElements = [];
            let sequenceElements = sequence.children('xsd\\:element');
            for (let i = 0; i < sequenceElements.length; i++) {
                let sequenceElement = this.parseElement(this.$(sequenceElements[i]));
                type.sequenceElements.push(sequenceElement);
            }
            let sequenceChoices = sequence.children('xsd\\:choice');
            for (let i = 0; i < sequenceChoices.length; i++) {
                let choiceElements = sequenceChoices[i].children('xsd\\:element');
                for (let j = 0; j < choiceElements.length; j++) {
                    let choiceElement = this.parseElement(this.$(choiceElements[i]));
                    type.sequenceElements.push(choiceElement);
                }
            }
        }
        if (simpleContent.length > 0) {
            let extension = simpleContent.children('xsd\\:extension');

            if (extension.length > 0) {
                let base = extension.attr('base');
                let attributes = extension.children('xsd\\:attribute');

                let referencedType = this.typeCache[base];
                if (!referencedType) {
                    let referencedType = this.queryWithIncludes(`xsd\\:complexType[name=${base.replace(":", "\\:")}]`);
                    if (referencedType.length > 0) {
                        referencedType = this.parseComplexType(this.$(referencedType[0]));
                    }
                }
                if (referencedType) {
                    type = clone(referencedType);
                    type.extendsType = referencedType;
                    if (!type.attributes) {
                        type.attributes = [];
                    }
                    for (let i = 0; i < attributes.length; i++) {
                        type.attributes.push(this.parseAttribute(this.$(attributes[i])));
                    }
                }
            }
        }

        type.name = name;
        type.sourceSchema = this.sourceSchema;
        if (name) {
            this.typeCache[name] = type;
        }
        return type;
    }

    parseSimpleType (xsdSimpleType) {
        let type = {};
        let name = xsdSimpleType.attr('name');
        let restriction = xsdSimpleType.children('xsd\\:restriction');

        // Try to get type from cache
        let cachedType = this.typeCache[name];
        if (cachedType) {
            return cachedType;
        }

        if (restriction.length > 0) {
            let parsedRestriction = this.parseRestriction(this.$(restriction[0]));

            // Copies the properties from parsedRestriction to type
            Object.assign(type, parsedRestriction);
        }

        type.sourceSchema = this.sourceSchema;
        type.name = name;
        if (name) {
            this.typeCache[name] = type;
        }
        return type;
    }

    parseRestriction (xsdRestriction) {
        let restriction = {};
        let base = xsdRestriction.attr('base');
        let enumeration = xsdRestriction.children('xsd\\:enumeration');
        let minExclusive = xsdRestriction.children('xsd\\:minExclusive');
        let minInclusive = xsdRestriction.children('xsd\\:minInclusive');
        let maxExclusive = xsdRestriction.children('xsd\\:maxExclusive');
        let maxInclusive = xsdRestriction.children('xsd\\:maxInclusive');
        let pattern = xsdRestriction.children('xsd\\:pattern');
        let length = xsdRestriction.children('xsd\\:length');
        let minLength = xsdRestriction.children('xsd\\:minLength');
        let maxLength = xsdRestriction.children('xsd\\:maxLength');
        let totalDigits = xsdRestriction.children('xsd\\:totalDigits');
        let fractionDigits = xsdRestriction.children('xsd\\:fractionDigits');

        let baseType = this.typeCache[base];
        if (!baseType) {
            let queriedType = this.queryWithIncludes(`xsd\\:complexType[name=${base.replace(":", "\\:")}]`);
            if (queriedType.length > 0) {
                baseType = this.parseComplexType(this.$(queriedType[0]));
            } else {
                queriedType = this.queryWithIncludes(`xsd\\:simpleType[name=${base.replace(":", "\\:")}]`);
                if (queriedType.length > 0) {
                    baseType = this.parseSimpleType(this.$(queriedType[0]));
                }
            }
        }

        if (baseType) {
            restriction.restrictsType = baseType;

            Object.assign(restriction, baseType);
            // restriction.enumeration = baseType.enumeration;
            // restriction.minExclusive = baseType.minExclusive;
            // restriction.minInclusive = baseType.minInclusive;
            // restriction.maxExclusive = baseType.maxExclusive;
            // restriction.maxInclusive = baseType.maxInclusive;
            // restriction.pattern = baseType.pattern;
            // restriction.length = baseType.length;
            // restriction.minLength = baseType.minLength;
            // restriction.maxLength = baseType.maxLength;
            // restriction.totalDigits = baseType.totalDigits;
            // restriction.fractionDigits = baseType.fractionDigits;
        } else {
            throw new Error(`Couldn't find baseType '${base}' for a restriction.`);
        }

        if (enumeration.length > 0) {
            restriction.enumeration = [];
            for (let i = 0; i < enumeration.length; i++) {
                restriction.enumeration.push(this.$(enumeration[i]).attr('value'));
            }
        }
        if (maxLength.length > 0) {
            restriction.maxLength = this.$(maxLength[0]).attr('value');
        }
        if (pattern.length > 0) {
            restriction.pattern = this.$(pattern[0]).attr('value');
        }
        if (length.length > 0) {
            restriction.length = this.$(length[0]).attr('value');
        }
        if (totalDigits.length > 0) {
            restriction.totalDigits = this.$(totalDigits[0]).attr('value');
        }
        if (fractionDigits.length > 0) {
            restriction.fractionDigits = this.$(fractionDigits[0]).attr('value');
        }
        if (minExclusive.length > 0) {
            restriction.minExclusive = this.$(minExclusive[0]).attr('value');
        }
        if (minInclusive.length > 0) {
            restriction.minInclusive = this.$(minInclusive[0]).attr('value');
        }
        if (maxExclusive.length > 0) {
            restriction.maxExclusive = this.$(maxExclusive[0]).attr('value');
        }
        if (maxInclusive.length > 0) {
            restriction.maxInclusive = this.$(maxInclusive[0]).attr('value');
        }
        if (minLength.length > 0) {
            restriction.minLength = this.$(minLength[0]).attr('value');
        }

        return restriction;
    }

    parseAttribute (xsdAttribute) {
        let attribute = {};
        let name = xsdAttribute.attr('name');
        let type = xsdAttribute.attr('type');
        let use = xsdAttribute.attr('use');

        attribute.name = name;
        attribute.use = use;

        // Get type of attribute
        if (type) {
            let cachedType = this.typeCache[type];
            if (cachedType) {
                attribute.type = cachedType;
            } else {
                let referencedType = this.queryWithIncludes(`xsd\\:simpleType[name=${type.replace(":", "\\:")}]`);
                if (referencedType.length > 0) {
                    attribute.type = this.parseSimpleType(this.$(referencedType[0]));
                }
            }
        } else {
            let innerType = xsdAttribute.children('xsd\\:simpleType');
            if (innerType.length > 0) {
                attribute.type = this.parseSimpleType(this.$(innerType[0]));
            }
        }
        
        if (!attribute.type) {
            throw new Error(`Couldn't find type '${type}' for attribute with name '${name}'.`);
        }

        return attribute;
    }
}

module.exports = XsdParser;