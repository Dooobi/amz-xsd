module.exports = 
{
    "xsd:normalizedString": {   // String without newlines and tabs 
        "dataType": "NORMALIZED_STRING",
    },
    "xsd:string": {             // All strings
        "dataType": "STRING",
    },
    "xsd:decimal": {            // 0.5, 3.141, -2.3, ...
        "dataType": "FLOAT",
    },
    "xsd:positiveInteger": {    // 1, 2, 3, ...
        "minInclusive": "1",
    },
    "xsd:nonNegativeInteger": { // 0, 1, 2, ...
        "dataType": "INTEGER",
        "minInclusive": "0",
    },
    "xsd:integer": {            // All integers
        "dataType": "INTEGER",
    },
    "xsd:boolean": {            // true, false, 1, 0
        "dataType": "BOOLEAN",
    },
    "xsd:date": {
        "dataType": "DATE",
    },
    "xsd:dateTime": {
        "dataType": "DATE_TIME",
    }
};