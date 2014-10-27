function getField(obj, fieldName, bottomOnly) {
  // if fieldName is foo.bar.0, return obj['foo']['bar']['0']
  var names = fieldName.split("."); //pretty simple, since we can't have . in field names
  for (var i in names) {
    if (obj[names[i]] == null) {
      return null;
    }
    obj = obj[names[i]];
  }
  if (bottomOnly && typeof obj === 'object' && !(obj instanceof ObjectId)) {
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

function printRow(header, doc, sep) {
  //print one document, default to | separation
  var row = "";
  for (var field in header) {
    //the value of the doc, unless doc is null, then this is the header row
    if (doc == null) {
      var val = field;
    } else {
      //avoid the null, convert to empty string
      var val = getField(doc, field, true) == null? "" : getField(doc, field);
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
    printRowSep(header);
  }
}

function printTable(data, docs, sep) {
  header = sortedHeader(data);
  if (typeof sep === 'undefined') {
    printRowSep(header, true)
    printHeader(header);
  } else {
    printRow(header, null, sep);
  }
  for (var i in docs) {
    printRow(header, docs[i], sep);
  }
}

function addField(field, res, obj) {
  //optional prefix parameter, default to empty string
  var val = getField(obj, field)
  if (val instanceof Array) {
    //add each element as a field
    for (var i = 0; i < val.length; i++) {
      addField(field + "." + i, res, obj)
    }
  } else if (typeof(val) == 'object' && !(val instanceof ObjectId)) {
    //recurse with prefix field
    for (var key in val) {
      addField(field + "." + key, res, obj)
    }
  } else {
    //base case, it's just a value, count it
    if (!res[field]) {
        res[field] = {count: 0, width: 0};
    }
    res[field].width = Math.max(res[field].width, val.toString().length, field.length);
    res[field].count++;
  }
}

function parseFields (docs) {
  var res = {};
  for (var i in docs) {
    var obj=docs[i];
    for (var field in obj) {
      addField(field, res, obj)
    }
  }
  return res;
}

DBQuery.prototype.table = function(sep) {
  var docs = this.toArray();
  printTable(parseFields(docs), docs, sep);
}

