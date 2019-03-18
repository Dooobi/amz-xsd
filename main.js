const fs = require('fs');
const XsdParser = require('./XsdParser.js');

let parser = new XsdParser('Beauty.xsd');

parser.parse();

let elementEntries = [['Name', 'Ref', 'Type', 'SourceSchema']];
let typeEntries = [['Name', 'SourceSchema']];

let elementKeys = Object.keys(parser.elements);
for (let i = 0; i < elementKeys.length; i++) {
    let element = parser.elements[elementKeys[i]];
    let line = [];

    line.push(element.name);
    line.push(element.ref);
    line.push(element.type);
    line.push(element.sourceSchema);

    elementEntries.push(line.join("\t"));
}

let typeKeys = Object.keys(parser.types);
for (let i = 0; i < typeKeys.length; i++) {
    let type = parser.types[typeKeys[i]];
    let line = [];

    line.push(type.name);
    line.push(type.sourceSchema);

    typeEntries.push(line.join("\t"));
}

fs.writeFileSync('elements.tsv', elementEntries.join("\n"));
fs.writeFileSync('types.tsv', typeEntries.join("\n"));
fs.writeFileSync('notHandledTags.txt', parser.notHandledTags.join("\n"));
fs.writeFileSync('baseTypes.txt', parser.baseTypes.join("\n"));

// function elementOutputWriter (element, type) {
//     return `INSERT INTO "ATTRIBUTE_DEFINITION" (${type})`;
// }

// function skipElementOutputCallback (element) {

// }