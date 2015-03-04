//
// Given an object and a fieldName, return the value of that field. If fieldName is dotted,
// interprate that to mean there are sub-documents, and traverse them.
// For example, getField({a: {b: 'c'}}, 'a.b') returns 'c'
// if bottomOnly is true, return null for any object value
//
function getField(obj, fieldName, bottomOnly) {
  // if fieldName is foo.bar.0, return obj['foo']['bar']['0']
  var names = fieldName.split("."); //pretty simple, since we can't have . in field names
  for (var i in names) {
    if (obj[names[i]] === null || typeof obj[names[i]] === 'undefined') {
      return null;
    }
    obj = obj[names[i]];
  }
  if (bottomOnly && typeof obj === 'object' && !(obj instanceof ObjectId || obj instanceof Array)) {
    obj = null;
  }
  return obj;
}

function sortedHeader(data) {
  var sortByCount=function (field1, field2) {
    var count1 = data[field1].count;
    var count2 = data[field2].count;
    if (count1 == count2) {
        // same count, break tie alphabetically (localeCompare is default sort)
        return field1.localeCompare(field2);
    }
    // <0 if field1 should come first, >0 if field2 should come first
    return count2 - count1;
  };

  // returns something like {b: 4, a: 2, c: 5}, with field names in order
  // according to count, mapping to their max field width
  var names = Object.keys(data).sort(); //sortByCount);
  var namesWithWidths = {};
  for (var i = 0; i < names.length; i += 1) {
    //javascript objects retain order, so this works
    namesWithWidths[names[i]] = data[names[i]].width;
  }
  return namesWithWidths;
}

function printWithSep(val, width, sep) {
  // print the value, but pad with spaces to be at least width long
  // just left justify for now
  return val.toString() + sep;
}

function printRowSep(header, noSep) {
  var out = "+";
  for (var field in header) {
    var width = header[field];
    out += new Array(width + 3).join("-");
    out += noSep ? "-" : "+";
  }
  out = noSep ? out.substring(0, out.length - 1) + "+" : out;
  print(out);
}

function padPrint(val, width) {
  // print the value, but pad with spaces to be at least width long
  // just left justify for now
  var out = "| " + val.toString();
  while (out.length < width + 3) {
    out += " ";
  }
  return out;
}

function getCommonPrefixed(header, prefix) {
  common = {};
  for (var field in header) {
    if (field.indexOf(prefix) === 0 && field !== prefix) {
      //starts with it, include the width required for it
      common[field] = header[field];
    }
  }
  return common;
}

function getMaxDepth(header) {
  var depth = 1; //can't be less than 1
  for (var field in header) {
    if (field.split('.').length > depth) {
      depth = field.split('.').length;
    }
  }
  return depth;
}

function printHeader(header) {
  var level = 1;
  var maxDepth = getMaxDepth(header);
  while (level < maxDepth) {
    var row = "";
    var rowSep = "";
    printed = {};
    for (var field in header) {
      var preField = field.split('.').slice(0, level).join('.');
      if (field.split('.').length > level && typeof(printed[preField]) === 'undefined') {
        printed[preField] = 1;
        common = getCommonPrefixed(header, preField);
        var size = 0;
        for (var subfield in common) {
          size += common[subfield];
        }
        size = size + 3*(Object.keys(common).length - 1);
        row += padPrint(preField, size);
        rowSep += "|-" + new Array(size + 2).join("-");
      } else if (typeof(printed[preField]) === 'undefined') {
        row += padPrint("", header[field]);
        rowSep += "| " + new Array(header[field] + 2).join(" ");
      }
    }
    row += "|";
    rowSep += "|";
    print(row);
    print(rowSep);
    level += 1;
  }
  printRow(header, null);
}

//
// Responsible for printing one row, corresponding to one document, default to | separation.
//
function printRow(header, doc, sep, arrayRecursing) {
  if (typeof(arrayRecursing) === 'undefined') {
    arrayRecursing = 0;
  }
  var row = "";
  var recurseAgain = false;
  for (var field in header) {
    //the value of the doc, unless doc is null, then this is the header row
    var val;
    if (doc === null) {
      val = field;
    } else {
      //avoid the null, convert to empty string
      val = getField(doc, field, true) === null? "" : getField(doc, field);
      if (val instanceof Array) {
        var lastValidIndex = val.length - 1;
        if (arrayRecursing <= lastValidIndex) {
          val = val[arrayRecursing].toString();
          if (arrayRecursing < lastValidIndex) {
            recurseAgain = true;
            val += ",";
          }
        } else {
          val = "";
        }
      } else if (arrayRecursing > 0) {
        val = "";
      }
    }
    if (typeof sep !== 'undefined') {
      row += printWithSep(val, header[field], sep);
    } else {
      row += padPrint(val, header[field]);
    }
  }
  if (typeof sep !== 'undefined') {
    row = row.substring(0, row.length - 1); // remove last separator
    print(row);
  } else {
    row += "|";
    print(row);
    if (recurseAgain) {
      printRow(header, doc, sep, arrayRecursing + 1);
    } else {
      printRowSep(header);
    }
  }
}

//
// Given a map of field names to max widths, the documents to display, and the sparator between
// them, print a tabular view of the documents.
//
function printTable(data, docs, sep) {
  header = sortedHeader(data);
  if (typeof sep === 'undefined') {
    printRowSep(header, true);
    printHeader(header);
  } else {
    printRow(header, null, sep);
  }
  for (var i in docs) {
    printRow(header, docs[i], sep);
  }
}

//
// Given a map of fieldNames to maximum width of values, a document, and a field name, update the
// map to new max widths (if the field in this doc has a larger value), or create entries for any
// new fields. If the value of the given field is itself a document, recurse to treat sub-fields
// as if they were the top level, e.g. {a: {b: 'c', d: {e: 'f'}}} is treated as
// {'a.b': 'c', 'a.d.e': 'f'}
//
function processField(fieldWidths, field, obj) {
  // Extract the value for that field, or subfield if field is dotted
  var val = getField(obj, field);

  print("processing " + field + ": " + val);
  if (typeof(val) == 'object' && !(val instanceof ObjectId || val instanceof Array)) {
    // recursive case, it's a sub-doc, recurse with prefix field
    for (var key in val) {
      processField(fieldWidths, field + "." + key, obj);
    }
  } else {
      //base case, it's just a value, count it
    if (!fieldWidths[field]) {
        fieldWidths[field] = {count: 0, width: 0};
    }

    if (val instanceof Array) {
      // Find largest element
      var betterToString = function() { return "[" + Array.prototype.toString.call(this) + "]"; };
      for (var i = 0; i < val.length; i++) {
        if (val[i] instanceof Array) {
          // Nested arrays, make them print with []'s
          val[i].toString = betterToString;
        }
        fieldWidths[field].width = Math.max(fieldWidths[field].width, val[i].toString().length, field.length);
      }
      // Still only counts as one!
      fieldWidths[field].count++;
    } else {
      fieldWidths[field].width = Math.max(fieldWidths[field].width, val.toString().length, field.length);
      fieldWidths[field].count++;
    }
  }
}

//
// Given an array of documents, determine which field names should be displayed in the table
// header, and what the maximum lengths of those fields are. Returns a map from field name to max
// width of the values associated with that field.
//
function parseFields (docs) {
  var res = {};
  for (var i in docs) {
    var obj=docs[i];
    for (var field in obj) {
      processField(res, field, obj);
    }
  }
  return res;
}

DBQuery.prototype.table = function(sep) {
  var docs = this.toArray();
  printTable(parseFields(docs), docs, sep);
};
