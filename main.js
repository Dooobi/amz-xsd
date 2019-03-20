const fs = require('fs');
const XsdParser = require('./XsdParser.js');

let parser = new XsdParser('Beauty.xsd');

parser.parse();

let namedElements = parser.parseSelection('xsd\\:element[name]', { withIncludes: true });

let elementEntries = [['Name', 'Type', 'SourceSchema']];
let typeEntries = [['Name', 'SourceSchema']];

let attributeDefinitionInserts = [];

for (let element of namedElements) {
    let line = [];

    if (element.name === "Ingredients") {
        console.log();
    }

    line.push(element.name);
    line.push(element.type);
    line.push(element.sourceSchema);

    elementEntries.push(line.join("\t"));

    attributeDefinitionInserts.push(generateAttributeDefinitionInsert(element));
}

fs.writeFileSync('output/elements.tsv', elementEntries.join("\n"));
// fs.writeFileSync('output/types.tsv', typeEntries.join("\n"));
// fs.writeFileSync('output/notHandledTags.txt', parser.notHandledTags.join("\n"));
fs.writeFileSync('output/builtInTypes.txt', parser.builtInTypes.join("\n"));

fs.writeFileSync('output/attributeDefinitions.sql', attributeDefinitionInserts.join("\n"));

function generateAttributeDefinitionInsert (element) {
    return `INSERT INTO "ATTRIBUTE_DEFINITION" ("ATTRIBUTE_DEFINITION_ID") VALUES ("${element.name}");`;
}
