d = {
  "a" : { "count" : 1, "width" : 5 },
  "b" : { "count" : 3, "width" : 3 },
  "c" : { "count" : 2, "width" : 3 },
  "d" : { "count" : 2, "width" : 4 },
};

cursor = [
  {a: "hello", b: 3, c: "yo"},
  {b: 3, c: "yo!", d: "hola"},
  {b: "hi!", d: "hey"}
];


function sortedHeader(data) {
  // returns something like {b: 4, a: 2, c: 5}, with field names in order
  // according to count, mapping to their max field width
  var sortByCount = function(field1, field2) {
    var count1 = data[field1].count;
    var count2 = data[field2].count;
    if (count1 == count2) {
      // same count, break tie alphabetically (localeCompare is default sort)
      return field1.localeCompare(field2);
    }
    // <0 if field1 should come first, >0 if field2 should come first
    return count2 - count1;
  }
  var names = Object.keys(data).sort(sortByCount);
  var namesWithWidths = {};
  for (var i = 0; i < names.length; i += 1) {
    //javascript objects retain order, so this works
    namesWithWidths[names[i]] = data[names[i]].width;
  }
  return namesWithWidths;
}

function padPrint(val, width, sep) {
  // print the value, but pad with spaces to be at least width long
  // just left justify for now
  var out = val.toString();
  while (out.length < width) {
    out += " "
  }
  out += sep
  return out
}

function printRow(header, doc) {
  //print one document, default to | separation
  var row = "";
  for (var field in header) {
    //the value of the doc, unless doc is null, then this is the header row
    if (doc == null) {
      var val = field;
    } else {
      //avoid the null, convert to empty string
      var val = doc[field] || "";
    }
    row += padPrint(val, header[field], "|");
  }
  row = row.substring(0, row.length - 1); // remove last separator
  print(row);
}

function printTable(data, cursor) {
  header = sortedHeader(data);
  printRow(header, null);
  while(cursor.hasNext()) {
    printRow(header, cursor.next());
  }
}

printTable(d, cursor)
