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
            case 'bottom': out = '\u2514'; break;
            case 'middle': out = '\u251C'; break;
        }
        for (var field in header) {
            var width = header[field];
            out += new Array(width + 3).join("\u2500");
            var sep;
            switch (rowStyle) {
                case 'bottom': sep = '\u2534'; break;
                case 'middle': sep = '\u253C'; break;
            }
            out += noSep ? "\u2500" : sep;
        }
        out = out.substring(0, out.length - 1);
        switch (rowStyle) {
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
        var padding = out.length + 1 /* for the extra space on the end */;
        out += val.toString();
        while (out.length < width + padding) {
            out += " ";
        }
        return out;
    }

    /*
     * Returns the sum of all the widths of fields who start with this prefix.
     */
    function getCommonPrefixedWidth(header, prefix) {
        var width = 0;
        var total = 0;
        Object.keys(header).forEach(function(field) {
            if (field.indexOf(prefix) === 0 && field !== prefix) {
                //  starts with it, include the width required for it.
                width += header[field];
                total += 1;
            }
        });
        // Account for the extra separation that would have been there ('| ' and ' ')
        return width + 3*(total - 1);
    }

    /*
     * Gets the maximum 'depth' of all the fields in the header. Depth here refers to the number of
     * dots in the field name. So 'a.b.c' has a depth of 3.
     */
    function getMaxDepth(header) {
        var depth = 1;  // the depth can't be less than 1.
        Object.keys(header).forEach(function(field) {
            if (field.split('.').length > depth) {
                depth = field.split('.').length;
            }
        });
        return depth;
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
     * The header for documents like {a: {b: 1, c: {d: 1}}}, e: {f: 1, g: 1}} would look
     * something like this:
     * +-------------+-----------+
     * | a           | e         |
     * +-----+-------+-----+-----+
     * |     | a.c   |     |     |
     * +-----+-------+-----+-----+
     * | a.b | a.c.d | e.f | e.g |
     * +=====+=======+=====+=====+
     * So to print it, we need to know how wide each box will be. To do so, we'll compute the
     * following 2D list (widths estimated).
     * [
     *  [{fieldName: 'a', width: 13}, {fieldName: 'e', width: 10}],
     *  [{fieldName: '', width: 5}, {fieldName: 'a.c', width: 8}, {fieldName: '', width: 5},
     *      {fieldName: '', width: 5}],
     *  [{fieldName: 'a.b', width: 5}, {fieldName: 'a.c.d', width: 8}, {fieldName: 'e.f', width: 5},
     *      {fieldName: 'e.g', width: 5}]
     * ]
     */
    function makeHeaderStructure(header) {
        /*
         * The field name with one fewer '.'s as the level we're on, truncated.
         * e.g. The level 1 prefix of 'a.b.c' is 'a', the level 2 prefix is 'a.b'.
         */
        function getPrefixForLevel(field, level) {
            return field.split('.').slice(0, level).join('.');
        }
        // First just add the header row itself (note we'll be going in reverse order)
        var result = [
            Object.keys(header).map(function(field) {
            return {fieldName: field, width: header[field]};
            })
        ];
        var maxDepth = getMaxDepth(header);
        var level = maxDepth - 1;  // We've already added the maxDepth row.
        while (level > 0) {
            var row = [];
            var prefixesAdded = {};
            Object.keys(header).forEach(function(field) {
                var fieldDepth = field.split(".").length;
                var prefixForLevel = getPrefixForLevel(field, level);
                if(field !== prefixForLevel && !prefixesAdded[prefixForLevel]) {
                    prefixesAdded[prefixForLevel] = true;
                    var commonWidth = getCommonPrefixedWidth(header, prefixForLevel);
                    row.push({fieldName: prefixForLevel, width: commonWidth});
                }
                else if (!prefixesAdded[prefixForLevel]) {
                    // We haven't already been taken care of by someone with a common ancestor,
                    // so we must not have an ancestor at this level, it's either higher up or
                    // non-existant.
                    row.push({fieldName: '', width: header[field]});
                }
            });
            // Add it to the beginning, so that they'll come out in order.
            result = [row].concat(result);
            level -= 1;
        }
        return result;
    }

    /*
     * Print the header in ascii format.
     */
    function printHeaderAscii(headerStructure) {
        // headerStructure is something like:
        // [
        //   [ {fieldName: '', width: 30}, {fieldName: 'a', width: 30}, ...],
        //   [ {fieldName: '', width: 30}, {fieldName: '', width: 8}, ...],
        //   ...
        // ]
        var rowSep;
        headerStructure.forEach(function(row) {
            var rowStr = '';
            rowSep = '+';
            row.forEach(function(doc) {
                rowStr += padPrint(doc.fieldName, doc.width, false);
                rowSep += new Array(doc.width + 3).join('-') + '+';
            });
            print(rowSep);
            print(rowStr + '|');
        });
        print('|' + new Array(rowSep.length - 1).join('=') + '|');
    }

    /*
     * Print the header in unicode format. A little more complicated, since we need to use the
     * symbols for the top left, top right, and better tell when to continue vertical bars or not.
     */
    function printHeaderUnicode(headerStructure) {
        var rowSep, rowStr, colBreaks, nPaddingChars;
        // Use this to keep track of where our columns ended, so that the next row can know if it's
        // continuing a vertical bar, or starting a new one (+ symbol versus T symbol). Need next
        // and current because while it's using the previous one, it has to store it's information
        // for the next row.
        colBreaks = {current: {}, next: {}};
        // The top row
        rowSep = '\u250C';  // Top left (r-ish).
        rowStr = '';
        nPaddingChars = 3;  // '| ' and ' ' around each field name.
        headerStructure[0].forEach(function(doc) {
            colBreaks.current[rowStr.length] = true;  // Vertical bar going down here.
            rowStr += padPrint(doc.fieldName, doc.width, true);
            rowSep += new Array(doc.width + nPaddingChars).join('\u2500') + '\u252C';  // -'s & T's.
        });
        rowSep = rowSep.slice(0, rowSep.length - 1) + '\u2510';  // Replace last T with top right.
        print(rowSep);
        print(rowStr + '\u2502');  // Add last vertical bar.
        // Rest of the rows (note each row is printing the characters separating it from the row
        // above it).
        for (var i = 1; i < headerStructure.length; i++) {
            var row = headerStructure[i];
            rowSep = '\u251C';
            rowStr = '';
            row.forEach(function(doc) {
                colBreaks.next[rowStr.length] = true;
                rowStr += padPrint(doc.fieldName, doc.width, true);
                var sep;
                if (colBreaks.current[rowStr.length]) {
                    // The above row also has a vertical bar here. Continue it with a '+'.
                    sep = '\u253C';
                }
                else {
                    // We're starting a vertical bar, use a T.
                    sep = '\u252C';
                }
                rowSep += new Array(doc.width + nPaddingChars).join('\u2500') + sep;  // -'s
            });
            print(rowSep.slice(0, rowSep.length - 1) + '\u2524');
            print(rowStr + '\u2502');
            colBreaks.current = colBreaks.next;
            colBreaks.next = {};
        }
        // The last header row. Here use double lines (like ='s), so different char set.
        rowSep = '\u255E';
        headerStructure[headerStructure.length - 1].forEach(function(doc) {
            rowSep += new Array(doc.width + nPaddingChars).join('\u2550') + '\u256A';
        });
        print(rowSep.slice(0, rowSep.length -1) + '\u2561');
    }

    function printHeader(headerStructure, useUnicode) {
        if (useUnicode) {
            printHeaderUnicode(headerStructure);
        }
        else {
            printHeaderAscii(headerStructure);
        }
    }

    /*
     * Given a map of field names to max widths, the documents to display, and the sparator between
     * them, print a tabular view of the documents.
     */
    function printTable(data, docs, opts) {
        var header = sortedHeader(data);
        var useUnicode = opts === undefined ? false : opts.unicode;
        var headerStructure = makeHeaderStructure(header);
        printHeader(headerStructure, useUnicode);
        docs.forEach(function(doc, i) {
            printRow(header, docs[i],
                     {useUnicode: useUnicode,
                      rowStyle: i === docs.length - 1 ? 'bottom' : 'middle'});
        });
    }

    /*
     * Given a map of fieldNames to maximum width of values, a document, and a field name, update
     * the map to new max widths (if the field in this doc has a larger value), or create entries
     * for any new fields. If the value of the given field is itself a document, recurse to treat
     * sub-fields as if they were the top level, e.g. {a: {b: 'c', d: {e: 'f'}}} is treated as
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

    /*
     * Main entry point here, function called from the shell.
     */
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
