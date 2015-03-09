(function (factory) {
    'use strict';

    // node
    if (module && 'exports' in module) {
        module.exports = factory();

    // mongo shell
    } else {
        __modules.table_view['tableView.js'] = factory();
    }

})(function factory(internal) {
    'use strict';
    var config = require('./config.js');

    /*
     * Given an object and a fieldName, return the value of that field. If fieldName is dotted,
     * interprate that to mean there are sub-documents, and traverse them.
     * For example, getField({a: {b: 'c'}}, 'a.b') returns 'c'
     * if bottomOnly is true, return null for any object value
     */
    function getField(obj, fieldName, bottomOnly) {
        // if fieldName is foo.bar.0, return obj['foo']['bar']['0']
        var names = fieldName.split("."); //pretty simple, since we can't have . in field names
        for (var i in names) {
            if (obj[names[i]] === null || typeof obj[names[i]] === 'undefined') {
                return null;
            }
            obj = obj[names[i]];
        }
        if (bottomOnly && typeof obj === 'object' &&
            !(obj instanceof ObjectId || obj instanceof Array)) {
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

    function printRowSepAscii(header, noSep) {
        var out = "+";
        if (unicodeOpts.useUnicode) {
            switch (unicodeOpts.rowStyle) {
                case 'top': out = '\u250C'; break;
                case 'bottom': out = '\u2514'; break;
                case 'middle': out = '\u251C'; break;
            }
        }
        for (var field in header) {
            var width = header[field];
            out += new Array(width + 3).join("-");
            out += noSep ? "-" : "+";
        }
        out = noSep ? out.substring(0, out.length - 1) + "+" : out;
        print(out);
    }

    function printRowSepUnicode(header, noSep, rowStyle) {
        var out;
        switch (rowStyle) {
            case 'top': out = '\u250C'; break;
            case 'bottom': out = '\u2514'; break;
            case 'middle': out = '\u251C'; break;
        }
        for (var field in header) {
            var width = header[field];
            out += new Array(width + 3).join("\u2500");
            var sep;
            switch (rowStyle) {
                case 'top': sep = '\u252C'; break;
                case 'bottom': sep = '\u2534'; break;
                case 'middle': sep = '\u253C'; break;
            }
            out += noSep ? "\u2500" : sep;
        }
        out = out.substring(0, out.length - 1);
        switch (rowStyle) {
            case 'top': out += '\u2510'; break;
            case 'bottom': out += '\u2518'; break;
            case 'middle': out += '\u2524'; break;
        }
        print(out);
    }

    function printRowSep(header, noSep, unicodeOpts) {
        if (unicodeOpts.useUnicode) {
            return printRowSepUnicode(header, noSep, unicodeOpts.rowStyle);
        }
        return printRowSepAscii(header, noSep);
    }

    /*
     * print the value, but pad with spaces to be at least width long just left justify for now
     */
    function padPrint(val, width, useUnicode) {
        var out = useUnicode? "\u2502 " : "| ";
        out += val.toString();
        while (out.length < width + 3) {  //TODO: magic number
            out += " ";
        }
        return out;
    }

    function getCommonPrefixed(header, prefix) {
        var common = {};
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

    function printHeader(header, useUnicode) {
        var level = 1;
        var maxDepth = getMaxDepth(header);
        while (level < maxDepth) {
            var row = "";
            var rowSep = "";
            var printed = {};
            for (var field in header) {
                var preField = field.split('.').slice(0, level).join('.');
                if (field.split('.').length > level && typeof(printed[preField]) === 'undefined') {
                    printed[preField] = 1;
                    var common = getCommonPrefixed(header, preField);
                    var size = 0;
                    for (var subfield in common) {
                        size += common[subfield];
                    }
                    size = size + 3*(Object.keys(common).length - 1);
                    row += padPrint(preField, size, useUnicode);
                    rowSep += useUnicode? "\u251C " : "|-";
                    rowSep += new Array(size + 2).join(useUnicode? "\u2500" : "-");
                } else if (typeof(printed[preField]) === 'undefined') {
                    row += padPrint("", header[field], useUnicode);
                    rowSep += useUnicode? "\u2502 " : "| ";
                    rowSep += new Array(header[field] + 2).join(" ");
                }
            }
            row += useUnicode? "\u2502" : "|";
            rowSep += useUnicode? "\u2502": "|";
            print(row);
            print(rowSep);
            level += 1;
        }
        var unicodeOpts = {useUnicode: useUnicode, rowStyle: 'middle'};
        printRow(header, null, unicodeOpts);
    }

    /*
     * Responsible for printing one 'row', corresponding to one document.
     * Note sometimes one 'row' can print multiple lines, if there is an array field present,
     * or if there is a value that is long enough to wrap to multiple lines.
     */
    function printRow(header, doc, unicodeOpts, numRecurses) {
        // We recurse if there's any wrapping or arrays, this variable is used to know what
        // to print on this call, default it to 0.
        if (typeof(numRecurses) === 'undefined') {
            numRecurses = 0;
        }
        var row = "";
        var recurseAgain = false;
        for (var field in header) {
            // the value of the doc, unless doc is null, then this is the header row.
            var val;
            if (doc === null) { // We're printing the header.
                val = field;
            } else {
                //avoid the null, convert to empty string
                val = getField(doc, field, true) === null? "" : getField(doc, field);
                // Arrays will print on multiple lines
                if (val instanceof Array) {
                    var lastValidIndex = val.length - 1;
                    if (numRecurses <= lastValidIndex) {
                        val = val[numRecurses].toString();
                        if (numRecurses < lastValidIndex) {
                            // Still more elements, need to print another line.
                            recurseAgain = true;
                            val += ",";
                        }
                    } else {
                        val = "";
                    }
                } else {
                    // Wrap long values to multiple lines, here only print the appropriate slice.
                    var sliceStart = header[field]*numRecurses;
                    var sliceEnd = sliceStart + header[field];
                    // Recurse again if it still isn't fully printed.
                    if (val.toString().length > sliceEnd) {
                        recurseAgain = true;
                    }
                    val = val.toString().slice(sliceStart, sliceEnd);
                }
            }
            row += padPrint(val, header[field], unicodeOpts.useUnicode);  // Fills in |'s
        }
        row += unicodeOpts.useUnicode? "\u2502" : "|";  // Final border
        print(row);
        if (recurseAgain) {
            printRow(header, doc, unicodeOpts, numRecurses + 1);
        } else {  // Done, just print the divider between rows
            printRowSep(header, false, unicodeOpts);
        }
    }

    /*
     * Given a map of field names to max widths, the documents to display, and the sparator between
     * them, print a tabular view of the documents.
     */
    function printTable(data, docs, opts) {
        var header = sortedHeader(data);
        printRowSep(header, true, {useUnicode: opts.unicode, rowStyle: 'top'});
        printHeader(header, opts.unicode);
        docs.forEach(function(doc, i) {
            printRow(header, docs[i],
                     {useUnicode: opts.unicode,
                      rowStyle: i === docs.length - 1 ? 'bottom' : 'middle'});
        });
    }

    /*
     * Given a map of fieldNames to maximum width of values, a document, and a field name, update the
     * map to new max widths (if the field in this doc has a larger value), or create entries for any
     * new fields. If the value of the given field is itself a document, recurse to treat sub-fields
     * as if they were the top level, e.g. {a: {b: 'c', d: {e: 'f'}}} is treated as
     * {'a.b': 'c', 'a.d.e': 'f'}
     */
    function processField(fieldWidths, field, obj) {
        // Extract the value for that field, or subfield if field is dotted
        var val = getField(obj, field);
        // Helper to update the max width we've seen so far
        function computeNewMaxWidth(field, val, previousMax) {
            // Should not be larger than the max width, unless the field name is really long
            var hardCap = Math.max(config.MAX_FIELD_WIDTH, field.length);
            var longest = Math.max(val.toString().length, previousMax, field.length);
            return Math.min(hardCap, longest);
        }

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
                    fieldWidths[field].width = computeNewMaxWidth(field,
                                                                  val[i],
                                                                  fieldWidths[field].width);
                }
                // Still only counts as one!
                fieldWidths[field].count++;
            } else {
                fieldWidths[field].width = computeNewMaxWidth(field,
                                                              val,
                                                              fieldWidths[field].width);
                fieldWidths[field].count++;
            }
        }
    }

    /*
     * Given an array of documents, determine which field names should be displayed in the table
     * header, and what the maximum lengths of those fields are. Returns a map from field name to max
     * width of the values associated with that field.
     */
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

    var tabularView = function tabularView(opts) {
        var docs = this.toArray();
        if (docs.length === 0) {
            return this;
        }
        printTable(parseFields(docs), docs, opts);
        return this;
    };
    return tabularView;
});
