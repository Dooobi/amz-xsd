const fs = require('fs');
const cheerio = require('cheerio');
const clone = require('clone');

class XsdParser {

    constructor (schemaLocation) {
        this.schemaLocation = schemaLocation;

        this.includes = {};
        this.elements = {};
        this.types = {};

        this.fileContent = fs.readFileSync(this.schemaLocation, "utf8");

        this.$ = cheerio.load(
            this.fileContent,
            {
                xmlMode: true
            }
        );

        // For debugging
        this.notHandledTags = [];
        this.baseTypes = [];
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
            this.baseTypes = [...new Set([...this.baseTypes, ...xsdParser.baseTypes])];
        }

        return includes;
    }

    parseDescendantsRecursive (element) {
        let children = element.children();
        
        this.parseSingleElement(element);

        for (let i = 0; i < children.length; i++) {
            this.parseDescendantsRecursive(this.$(children[i]));
        }

        for (let i = 0; i < this.types.length; i++) {
            this.resolveType(this.types[i]);
        }
        for (let i = 0; i < this.elements.length; i++) {
            this.resolveElement(this.elements[i]);
        }
    }

    findType (elementTag) {
        let element = this.$(elementTag);

        if (element.attr('type')) {
            return element.attr('type');
        }

        let complexType = element.find('xsd\\:complexType').first();
        if (complexType) {
            return "inline complexType";
        }

        let simpleType = element.find('xsd\\:simpleType').first();
        if (simpleType) {
            return "inline simpleType";
        }

        let refElement = element.attr('ref');
        if (refElement) {
            return "element reference";
        }

        return null;
    }

    parseSingleElement (element) {
        let tagName = element.get(0).tagName;
        let baseType = element.attr('base');

        if (baseType && baseType.startsWith('xsd:')) {
            if (this.baseTypes.indexOf(baseType) < 0) {
                this.baseTypes.push(baseType);
            }
        }

        switch (tagName) {
            case 'xsd:element':
                let elementTag = this.parseElementTag(element);
                if (elementTag.name) {
                    this.elements[elementTag.name] = elementTag;
                }
                break;
            case 'xsd:simpleType':
            case 'xsd:complexType':
                let typeTag = this.parseTypeTag(element);
                if (typeTag.name) {
                    this.types[typeTag.name] = typeTag;
                }
                break;
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
    }

    getAscendantsRecursive (element) {
        let ascendants = [element];

        if (element.parent().length > 0
            && element.get(0).tagName !== 'xsd:element') {
            return ascendants.concat(this.getAscendantsRecursive(element.parent()));
        }

        return ascendants;
    }

    parseTypeTag (element) {
        let name = element.attr('name');

        return {
            name: name,
            originalElement: element,
            sourceSchema: this.schemaLocation
        };
    }

    parseElementTag (element) {
        let name = element.attr('name');
        let ref = element.attr('ref');
        let type = element.attr('type');

        return {
            name: name,
            ref: ref,
            type: type,
            originalElement: element,
            sourceSchema: this.schemaLocation
        };
    }

    resolveElement (parsedElement) {
        // parsedElement.type = ;
        return {
            name: name,
            ref: ref,
            type: type,
            originalElement: element,
            sourceSchema: this.schemaLocation
        };
    }

    resolveType (parsedType) {
        // originalElement.
        // return {
        //     name: name,
        //     ref: ref,
        //     type: type,
        //     originalElement: element,
        //     sourceSchema: this.schemaLocation
        // };
    }

    queryWithIncludes (queryString) {
        let result = this.$(queryString);

        if (result.length === 0) {
            for (let i = 0; i < this.includes.length; i++) {
                result = this.includes.parser.$(queryString);
                if (result.length > 0) {
                    return result;
                }
            }
        }

        return result;
    }

    parseElement (xsdElement) {
        let element = {};
        let name = xsdElement.attr("name");
        let ref = xsdElement.attr("ref");
        let type = xsdElement.attr("type");

        // Try to get element from cache
        let cachedElement = this.elementCache[name] || this.elementCache[ref];
        if (cachedElement) {
            return cachedElement;
        }
        
        if (ref) {
            let referencedElement = this.queryWithIncludes(`xsd\\:element[name=${ref}]`); // what if result is empty? (length=0)
            return this.parseElement(referencedElement);
        }

        // Get type of element
        if (type) {
            let cachedType = typeCache[type];
            if (cachedType) {
                element.type = cachedType;
            } else {
                let referencedType = this.queryWithIncludes(`xsd\\:complexType[name=${type}]`);
                if (referencedType.length > 0) {
                    element.type = this.parseComplexType(referencedType[0]);
                } else {
                    referencedType = this.queryWithIncludes(`xsd\\:simpleType[name=${type}]`);
                    if (referencedType.length > 0) {
                        element.type = this.parseSimpleType(referencedType[0]);
                    }
                }
            }
        } else {
            let innerType = xsdElement.children('xsd\\:complexType');
            if (innerType.length > 0) {
                element.type = this.parseComplexType(innerType[0]);
            } else {
                innerType = xsdElement.children('xsd\\:simpleType');
                if (innerType.length > 0) {
                    element.type = this.parseSimpleType(innerType);
                }
            }
        }

        // Maybe check if valid
        return element;
    }

    /**
     * Ignored children: complexContent, attribute
     */
    parseComplexType (xsdElement) {
        let type = {
            attributes: []
        };
        let simpleContent = xsdElement.children('xsd\\:simpleContent');
        let sequence = xsdElement.children('xsd\\:sequence');
        let choice = xsdElement.children('xsd\\:choice');

        // Try to get type from cache
        let cachedType = this.typeCache[name];
        if (cachedType) {
            return cachedType;
        }

        if (choice.length > 0) {
            type.choiceElements = [];
            let choiceElements = choice.children('xsd\\:element');
            for (let i = 0; i < choiceElements.length; i++) {
                let choiceElement = this.parseElement(choiceElements[i]);
                type.choiceElements.push(choiceElement);
            }
        }
        if (sequence.length > 0) {
            type.sequenceElements = [];
            let sequenceElements = sequence.children('xsd\\:element');
            for (let i = 0; i < choiceElements.length; i++) {
                let sequenceElement = this.parseElement(sequenceElements[i]);
                type.sequenceElements.push(sequenceElement);
            }
            let sequenceChoices = sequence.children('xsd\\:choice');
            for (let i = 0; i < sequenceChoices.length; i++) {
                let choiceElements = sequenceChoices[i].children('xsd\\:element');
                for (let j = 0; j < choiceElements.length; j++) {
                    let choiceElement = this.parseElement(choiceElements[i]);
                    type.sequenceElements.push(choiceElement);
                }
            }
        }
        if (simpleContent.length > 0) {
            let extension = simpleContent.children('xsd\\:extension');

            if (extension.length > 0) {
                let base = extension.attr('base');
                let attributes = extension.children('xsd:\\attribute');

                let referencedType = this.typeCache[base];
                if (!referencedType) {
                    let referencedType = this.queryWithIncludes(`xsd\\:complexType[name=${base}]`);
                    if (referencedType.length > 0) {
                        referencedType = this.parseComplexType(referencedType[0]);
                    }
                }
                if (referencedType) {
                    type = clone(referencedType);
                    
                    for (let i = 0; i < attributes.length; i++) {
                        type.push(this.parseAttribute(attributes[i]));
                    }
                }
            }
        }

        return type;
    }

    parseSimpleType (xsdElement) {

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
            let cachedType = typeCache[type];
            if (cachedType) {
                attribute.type = cachedType;
            } else {
                let referencedType = this.queryWithIncludes(`xsd\\:simpleType[name=${type}]`);
                if (referencedType.length > 0) {
                    element.type = this.parseSimpleType(referencedType[0]);
                }
            }
        } else {
            let innerType = xsdAttribute.children('xsd\\:simpleType');
            if (innerType.length > 0) {
                attribute.type = this.parseSimpleType(innerType[0]);
            }
        }
        
        return attribute;
    }
}

module.exports = XsdParser;