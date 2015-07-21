(function (factory) {
    "use strict";

    // node
    if (module && "exports" in module) {
        module.exports = factory();

    // mongo shell
    } else {
        __modules.table_view["tableView.js"] = factory();
    }

})(function factory(internal) {
    "use strict";
    var config = require("./config.js");

    /**
     * Given an object and a fieldName, return the value of that field. If fieldName is dotted,
     * interprate that to mean there are sub-documents, and traverse them. For example,
     * getField({a: {b: "c"}}, "a.b") returns "c".
     *
     * If bottomOnly is true, return null for any object value.
     */
    function getField(obj, fieldName, bottomOnly) {
        var names = fieldName.split(".");  // pretty simple, since we can't have "." in field names.

        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            if (obj[name] === null || typeof obj[name] === "undefined") {
                return null;
            }
            obj = obj[name];
        }

        if (bottomOnly && typeof obj === "object" &&
            !(obj instanceof ObjectId || obj instanceof Array)) {
            obj = null;
        }
        return obj;
    }

    /**
     * Print the ascii characters to separate two rows.
     */
    function printRowSepAscii(header, noSep) {
        var out = "+";
        Object.keys(header).forEach(function(field) {
            var width = header[field];
            out += new Array(width + 3).join("-");
            out += noSep ? "-" : "+";
        });
        out = noSep ? out.substring(0, out.length - 1) + "+" : out;
        print(out);
    }

    /**
     * Print the unicode characters to separate two rows.
     */
    function printRowSepUnicode(header, noSep, rowStyle) {
        var out;
        switch (rowStyle) {
            case "bottom": out = "\u2514"; break;  // |_
            case "middle": out = "\u251C"; break;  // |-
        }
        Object.keys(header).forEach(function(field) {
            var width = header[field];
            out += new Array(width + 3).join("\u2500");  // -
            var sep;
            switch (rowStyle) {
                case "bottom": sep = "\u2534"; break;  // -|-
                case "middle": sep = "\u253C"; break;  // _|_
            }
            out += noSep ? "\u2500" : sep;
        });
        out = out.substring(0, out.length - 1);
        switch (rowStyle) {
            case "bottom": out += "\u2518"; break;  // _|
            case "middle": out += "\u2524"; break;  // -|
        }
        print(out);
    }

    /**
     * Print the characters to separate two rows.
     */
    function printRowSep(header, noSep, unicodeOpts) {
        return unicodeOpts.useUnicode ? printRowSepUnicode(header, noSep, unicodeOpts.rowStyle)
                                      : printRowSepAscii(header, noSep);
    }

    /**
     * print the value, but pad with spaces to be at least width long just left justify for now
     */
    function padPrint(val, width, useUnicode) {
        var out = useUnicode ? "\u2502 " : "| ";
        var padding = out.length + 1;  // for the extra space on the end.
        out += val.toString();
        while (out.length < width + padding) {
            out += " ";
        }
        return out;
    }

    /**
     * Returns the sum of all the widths of fields who start with this prefix.
     * TODO: this doesn't do exactly what it says anymore.
     */
    function getCommonPrefixedWidth(header, prefix, level) {
        function getPrefix(field) {
            return field.split(".").slice(0, level).join(".");
        }
        var width = 0;
        var total = 0;
        Object.keys(header).forEach(function(field) {
            if (getPrefix(field) === prefix) {
                // Starts with it, include the width required for it.
                width += header[field];
                total += 1;
            }
        });
        // Account for the extra separation that would have been there ("| " and " ").
        return width + 3 * (total - 1);
    }

    /**
     * Helper to calculate the "depth" of a field name: which row of the header it would go in.
     * e.g. getDepth("a.b") == 2, getDepth("a") == 1.
     */
    function getDepth(field) {
        return field.split(".").length;
    }

    /**
     * Gets the maximum "depth" of all the fields in the header. Depth here refers to the number of
     * dots in the field name. So "a.b.c" has a depth of 3.
     */
    function getMaxDepth(header) {
        var depth = 1;  // the depth can't be less than 1.
        Object.keys(header).forEach(function(field) {
            var fieldDepth = getDepth(field);
            if (fieldDepth > depth) {
                depth = fieldDepth;
            }
        });
        return depth;
    }

    /**
     * Responsible for printing one "row", corresponding to one document.
     * Note sometimes one "row" can print multiple lines, if there is an array field present,
     * or if there is a value that is long enough to wrap to multiple lines.
     */
    function printRow(header, doc, unicodeOpts, numRecurses) {
        // We recurse if there's any wrapping or arrays, this variable is used to know what
        // to print on this call, default it to 0.
        if (typeof numRecurses === "undefined") {
            numRecurses = 0;
        }
        var row = "";
        var recurseAgain = false;
        Object.keys(header).forEach(function(field) {
            // the value of the doc, unless doc is null, then this is the header row.
            var val;
            if (doc === null) { // We're printing the header.
                val = field;
            } else {
                // Avoid the null, convert to empty string
                val = getField(doc, field, true) === null ? "" : getField(doc, field);
                // Arrays will print on multiple lines
                if (val instanceof Array) {
                    var lastValidIndex = val.length - 1;
                    if (numRecurses <= lastValidIndex) {
                        val = tojson(val[numRecurses], "" /* indent */, true /* no newlines */);
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
                    var sliceStart = header[field] * numRecurses;
                    var sliceEnd = sliceStart + header[field];
                    // Recurse again if it still isn't fully printed.
                    if (val.toString().length > sliceEnd) {
                        recurseAgain = true;
                    }
                    val = val.toString().slice(sliceStart, sliceEnd);
                }
            }
            row += padPrint(val, header[field], unicodeOpts.useUnicode);  // Fills in |'s
        });
        row += unicodeOpts.useUnicode ? "\u2502" : "|";  // Final border
        print(row);
        if (recurseAgain) {
            printRow(header, doc, unicodeOpts, numRecurses + 1);
        } else {  // Done, just print the divider between rows
            printRowSep(header, false, unicodeOpts);
        }
    }

    /**
     * The header for documents like {a: {b: 1, c: {d: 1}}}, e: {f: 1, g: 1}} would look
     * something like this:
     * +-------------+-----------+
     * | a           | e         |
     * +-----+-------+-----+-----+
     * | a.b | a.c   | e.f | e.g |
     * |     +-------+     |     |
     * |     | a.c.d |     |     |
     * +=====+=======+=====+=====+
     * So to print it, we need to know how wide each box will be. To do so, we'll compute the
     * following 2D list (widths estimated).
     * [
     *  [{fieldName: "a", width: 13}, {fieldName: "e", width: 10}],
     *  [{fieldName: "a.b", width: 5}, {fieldName: "a.c", width: 8}, {fieldName: "", width: 5},
     *      {fieldName: "", width: 5}],
     *  [{fieldName: "a.b", width: 5}, {fieldName: "a.c.d", width: 8}, {fieldName: "e.f", width: 5},
     *      {fieldName: "e.g", width: 5}]
     * ]
     */
    function makeHeaderStructure(header) {
        /**
         * The field name with one fewer "."s as the level we're on, truncated.
         * e.g. The level 1 prefix of "a.b.c" is "a", the level 2 prefix is "a.b".
         */
        function getPrefixForLevel(field, level) {
            return field.split(".").slice(0, level).join(".");
        }
        var maxDepth = getMaxDepth(header);
        var level = maxDepth;  // We've already added the maxDepth row.
        var result = [];
        while (level > 0) {
            var row = [];
            var prefixesAdded = {};
            var fields = Object.keys(header);
            for (var i = 0; i < fields.length; i++) {
                var field = fields[i];
                var prefixForLevel = getPrefixForLevel(field, level);
                var commonWidth = getCommonPrefixedWidth(header, prefixForLevel, level);
                if (getDepth(prefixForLevel) === level) {
                    if (!prefixesAdded[prefixForLevel]) {
                        prefixesAdded[prefixForLevel] = true;
                        // This width is including too many things if the prefix is shorter.
                        row.push({fieldName: prefixForLevel, width: commonWidth});
                    }
                } else {
                    if (!prefixesAdded[prefixForLevel]) {
                        prefixesAdded[prefixForLevel] = true;
                        row.push({fieldName: "", width: commonWidth});
                    }
                }
            }
            // Add it to the beginning, so that they'll come out in order.
            result = [row].concat(result);
            level -= 1;
        }
        return result;
    }

    /**
     * Print the header in ascii format.
     */
    function printHeaderAscii(headerStructure) {
        // headerStructure is something like:
        // [
        //   [ {fieldName: "", width: 30}, {fieldName: "a", width: 30}, ...],
        //   [ {fieldName: "", width: 30}, {fieldName: "", width: 8}, ...],
        //   ...
        // ]
        var rowSep;
        headerStructure.forEach(function(row) {
            var rowStr = "";
            rowSep = row[0].fieldName === "" ? "|" : "+";
            row.forEach(function(doc, i) {
                rowStr += padPrint(doc.fieldName, doc.width, false);
                if (doc.fieldName === "") {
                    var sep;
                    if (i + 1 < row.length && row[i + 1].fieldName !== "") {
                        // The next doc will need a header separator.
                        sep = "+";
                    } else {
                        sep = "|";
                    }
                    rowSep += new Array(doc.width + 3).join(" ") + sep;
                } else {
                    // We need a header separator.
                    rowSep += new Array(doc.width + 3).join("-") + "+";
                }
            });
            print(rowSep);
            print(rowStr + "|");
        });
        print("|" + new Array(rowSep.length - 1).join("=") + "|");
    }

    /**
     * Helper to print the first row of the header.
     */
    function printTopHeaderRowUnicode(colBreaks, headerStructure, nPaddingChars) {
        var rowSep = "\u250C";  // Top left (,-).
        var rowStr = "";
        headerStructure[0].forEach(function(doc) {
            colBreaks.current[rowStr.length] = true;  // Vertical bar going down here.
            rowStr += padPrint(doc.fieldName, doc.width, true);
            rowSep += new Array(doc.width + nPaddingChars).join("\u2500") + "\u252C";  // -'s & T's.
        });
        // Replace last T with top right (,-).
        rowSep = rowSep.slice(0, rowSep.length - 1) + "\u2510";
        print(rowSep);
        print(rowStr + "\u2502");  // Add last vertical bar.
    }

    /**
     * Helper to print the table characters for the bottom row of the table.
     */
    function printBottomHeaderRowUnicode(headerStructure, nPaddingChars) {
        var rowSep = "\u255E";
        headerStructure[headerStructure.length - 1].forEach(function(doc) {
            rowSep += new Array(doc.width + nPaddingChars).join("\u2550") + "\u256A";
        });
        // Replace last =|= with =|.
        print(rowSep.slice(0, rowSep.length - 1) + "\u2561");
    }

    /**
     * Helper to figure out which unicode table character to use to as a corner to a cell in the
     * header table.
     */
    function getUnicodeHeaderSeparator(i, row, continuingVertical) {
        var doc = row[i];
        var needHeaderBar = doc.fieldName !== "";
        if (i + 1 < row.length) {
            var nextDoc = row[i + 1];
            var needNextHeaderBar = nextDoc.fieldName !== "";

            if (continuingVertical) {
                // The above row also has a vertical bar here. Continue it with a "+".
                var continuationSymbols = [
                    ["\u2502", "\u251C"],  //  |     |-
                    ["\u2524", "\u253C"]   // -|    -|-
                ];
                return continuationSymbols[Number(needHeaderBar)][Number(needNextHeaderBar)];
            }

            // No vertical bar above us, start one.
            var nonContinuationSymbols = [
                ["\u2502", "\u250C"],  //  |    ,-
                ["\u2510", "\u252C"]   // -,   -,-
            ];
            return nonContinuationSymbols[Number(needHeaderBar)][Number(needNextHeaderBar)];
        }

        // The last doc in the row.
        //                        -|    or   |
        return needHeaderBar ? "\u2524" : "\u2502";
    }

    /**
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
        nPaddingChars = 3;  // "| " and " " around each field name.

        // The top row.
        printTopHeaderRowUnicode(colBreaks, headerStructure, nPaddingChars);

        // Rest of the rows.
        // Each row will print the characters separating it from the row above it).
        for (var i = 1; i < headerStructure.length; i++) {
            var row = headerStructure[i];

            rowSep = row[0].hasAncestor ? "\u251C" : "\u2502";  // |- vs. |
            rowStr = "";

            for (var j = 0; j < row.length; j++) {
                var doc = row[j];
                colBreaks.next[rowStr.length] = true;
                rowStr += padPrint(doc.fieldName, doc.width, true);
                var needHeaderBar = doc.fieldName !== "";

                var sep = getUnicodeHeaderSeparator(j, row, colBreaks.current[rowStr.length]);
                var joinChar = needHeaderBar ? "\u2500" : " ";  // -'s or spaces?
                rowSep += new Array(doc.width + nPaddingChars).join(joinChar) + sep;
            }

            print(rowSep);
            print(rowStr + "\u2502");

            colBreaks.current = colBreaks.next;
            colBreaks.next = {};
        }

        // The last header row. Here use double lines (like ='s), so different char set.
        printBottomHeaderRowUnicode(headerStructure, nPaddingChars);
    }

    function printHeader(headerStructure, useUnicode) {
        return useUnicode ? printHeaderUnicode(headerStructure) : printHeaderAscii(headerStructure);
    }

    /**
     * Given a map of field names to max widths, the documents to display, and the sparator between
     * them, print a tabular view of the documents.
     */
    function printTable(header, docs, opts) {
        // var header = sortedHeader(data);
        var useUnicode = opts === undefined ? false : opts.unicode;
        var headerStructure = makeHeaderStructure(header);
        printHeader(headerStructure, useUnicode);
        docs.forEach(function(doc, i) {
            printRow(header, docs[i],
                     {useUnicode: useUnicode,
                      rowStyle: i === docs.length - 1 ? "bottom" : "middle"});
        });
    }

    /**
     * Given a map of fieldNames to maximum width of values, a document, and a field name, update
     * the map to new max widths (if the field in this doc has a larger value), or create entries
     * for any new fields. If the value of the given field is itself a document, recurse to treat
     * sub-fields as if they were the top level, e.g. {a: {b: "c", d: {e: "f"}}} is treated as
     * {"a.b": "c", "a.d.e": "f"}
     */
    function processField(fieldWidths, field, obj) {
        // Extract the value for that field, or subfield if field is dotted
        var val = getField(obj, field);
        // Helper to update the max width we've seen so far
        function computeNewMaxWidth(previousMax) {
            // Should not be larger than the max width, unless the field name is really long
            var hardCap = Math.max(config.MAX_FIELD_WIDTH, field.length);
            var longest = Math.max(val.toString().length, previousMax, field.length);
            return Math.min(hardCap, longest);
        }

        if (typeof val === "object" && !(val instanceof ObjectId || val instanceof Array)) {
            // recursive case, it's a sub-doc, recurse with prefix field
            Object.keys(val).forEach(function(key) {
                processField(fieldWidths, field + "." + key, obj);
            });
        } else {
            //base case, it's just a value, count it

            // Initialize to 0.
            if (!fieldWidths[field]) {
                fieldWidths[field] = 0;
            }

            if (val instanceof Array) {
                // Find largest element
                val.forEach(function(elt) {
                    var jsonedElt = tojson(elt, "" /* indent */, true /* no newlines */);
                    // Ignore cap on sub-fields of arrays (for now).
                    fieldWidths[field] = Math.max(fieldWidths[field],
                                                  jsonedElt.toString().length,
                                                  field.length);
                });
            } else {
                fieldWidths[field] = computeNewMaxWidth(fieldWidths[field]);
            }
        }
    }

    /**
     * Given an array of documents, determine which field names should be displayed in the table
     * header, and what the maximum lengths of those fields are. Returns a map from field name to
     * max width of the values associated with that field.
     */
    function parseFields (docs) {
        var res = {};
        docs.forEach(function(obj) {
            Object.keys(obj).forEach(function(field) {
                processField(res, field, obj);
            });
        });
        var fields = Object.keys(res).sort();
        var sortedRes = {};
        fields.forEach(function(field) {
            sortedRes[field] = res[field];
        });
        return sortedRes;
    }

    /**
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
