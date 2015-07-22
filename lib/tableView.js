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

    /* -------------------------------- Misc helpers --------------------------------- */

    /**
     * Helper to determine if the input is a raw javascript object. That is, not an ObjectId, or any
     * other custom type of object.
     */
    function isObject(x) {
        return (x !== null && !Array.isArray(x) &&
                (x.toString() === "[object BSON]" || x.toString() === "[object Object]" ||
                 (typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype)));
    }

    /**
     * Given an object and a fieldName, return the value of that field. If fieldName is dotted,
     * intereprate that to mean there are sub-documents, and traverse them. For example,
     * getField({a: {b: "c"}}, "a.b") returns "c".
     *
     * If bottomOnly is true, return undefined for any object value.
     */
    function getField(obj, fieldName, bottomOnly) {
        var names = fieldName.split(".");  // pretty simple, since we can't have "." in field names.

        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            if (obj[name] === undefined) {
                return undefined;
            }
            obj = obj[name];
        }

        if (bottomOnly && isObject(obj)) {
            obj = undefined;
        }
        return obj;
    }

    /**
     * Sets the given field on an object if it's present. 'fieldName' can be dotted, e.g. "a.b"
     * means set the "b" field of the document found in the "a" field, if present.
     */
    function setFieldIfPresent(obj, fieldName, newVal) {
        if (obj === null || typeof obj !== "object") {
            return;
        }
        var names = fieldName.split(".");

        for (var i = 0; i < names.length - 1; i++) {
            var name = names[i];
            if (!obj.hasOwnProperty(name)) {
                return;
            }
            obj = obj[name];
        }
        name = names[names.length - 1];
        if (!obj.hasOwnProperty(name)) {
            return;
        }
        obj[name] = newVal;
    }

    /**
     * print the value, but pad with spaces to be at least width long just left justify for now
     */
    function padPrint(val, width, useUnicode, firstVal) {
        var out = "| ";
        if (useUnicode) {
            out = firstVal ? "║ " : "│ ";
        }
        var padding = out.length + 1;  // for the extra space on the end.
        out += String(val);
        while (out.length < width + padding) {
            out += " ";
        }
        return out;
    }

    /**
     * Returns the sum of all the widths of fields which have the same prefix for a given level.
     * e.g. "a.b" and "a.b.c" have the same prefix for level 2, but "a" and "a.b" do not.
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
        // account for the extra separation that would have been there ("| " and " ").
        return width + 3 * (total - 1);
    }

    /**
     * Helper to calculate the "depth" of a field name.
     * ex: getDepth("a.b") == 2, getDepth("a") == 1.
     */
    function getDepth(field) {
        return field.split(".").length;
    }

    /**
     * Gets the maximum "depth" of all the fields in the header.
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
     * Helper to replace the last character of a string with another.
     */
    function replaceLastCharacter(string, character) {
        return string.slice(0, string.length - 1) + character;
    }

    /**
     * Determines the length of the longest line in a string which contains newline characters.
     */
    function getMaxLineLength(stringVal) {
        var fieldLength = 0;
        var i = 0;
        var lineStart = 0;
        while (i < stringVal.length) {
            if (stringVal[i] === "\n") {
                fieldLength = Math.max(i - lineStart, fieldLength);
                lineStart = i + 1;
            }
            i++;
        }
        return Math.max(i - lineStart, fieldLength);
    }

    /* -------------------------------- Unicode implementations --------------------------------- */

    /**
     * Helper to print the first row of the header.
     */
    function printTopHeaderRowUnicode(colBreaks, headerStructure, nPaddingChars) {
        var rowSep = "╔";
        var rowStr = "";
        headerStructure[0].forEach(function(doc, i) {
            colBreaks.currentRow[rowStr.length] = true;  // Vertical bar going down here.
            rowStr += padPrint(doc.fieldName, doc.width, true, i === 0);
            rowSep += new Array(doc.width + nPaddingChars).join("═") + "╤";
        });
        print(replaceLastCharacter(rowSep, "╗"));
        print(rowStr + "║");
    }

    /**
     * Helper to print the table characters for the bottom row of the table.
     */
    function printBottomHeaderRowUnicode(headerStructure, nPaddingChars) {
        var rowSep = "╠";
        headerStructure[headerStructure.length - 1].forEach(function(doc) {
            rowSep += new Array(doc.width + nPaddingChars).join("═") + "╪";
        });
        print(replaceLastCharacter(rowSep, "╣"));
    }

    /**
     * Helper to figure out which unicode table character to use to as a corner to a cell in the
     * header table.
     */
    function getUnicodeHeaderSeparator(i, headerRow, continuingVertical) {
        var doc = headerRow[i];
        var hasHeaderBar = doc.fieldName !== "";

        if (i + 1 < headerRow.length) {
            var nextDoc = headerRow[i + 1];
            var needNextHeaderBar = nextDoc.fieldName !== "";

            // There are three factors to use to decide which symbol to use, use 3-Dimensional array
            // to do the decision. One 2D array for continuing vertical bar, one for without, rows
            // are whether this cell (to the left of the break) needs a header, columns are whether
            // the next cell (to the right of the break) needs a header.
            var headerSymbols = [
                // Don't need to continue vertical bar.
                [["│", "┌"],   // Don't need header for this cell.
                 ["┐", "┬"]],  // Need header for this cell.

                // Need to continue vertical bar.
                [["│", "├"],   // Don't need header for this cell.
                 ["┤", "┼"]]  // Need header for this cell.
            ];

            var row = Number(hasHeaderBar);
            var col = Number(needNextHeaderBar);
            var matrixIdx = Number(Boolean(continuingVertical));
            return headerSymbols[matrixIdx][row][col];
        }

        // The last doc in the row.
        return hasHeaderBar ? "╢" : "║";
    }

    /**
     * Print the header in unicode format. A little more complicated, since we need to use the
     * symbols for the top left, top right, and better tell when to continue vertical bars or not.
     */
    function printHeaderUnicode(headerStructure) {
        var rowSep, rowStr, colBreaks, nPaddingChars;

        // Use this to keep track of where our columns ended, so that the next row can know if it's
        // continuing a vertical bar, or starting a new one (┼, ┤, etc. vs ┬, ┐, etc.).
        colBreaks = {currentRow: {}, nextRow: {}};

        nPaddingChars = 3;  // "| " and " " around each field name.

        printTopHeaderRowUnicode(colBreaks, headerStructure, nPaddingChars);

        // Each row will print the characters separating it from the row above it).
        for (var i = 1; i < headerStructure.length; i++) {
            var row = headerStructure[i];

            rowSep = row[0].hasAncestor ? "╟" : "║";
            rowStr = "";

            for (var j = 0; j < row.length; j++) {
                var doc = row[j];
                colBreaks.nextRow[rowStr.length] = true;
                rowStr += padPrint(doc.fieldName, doc.width, true, j === 0);
                var hasHeaderBar = doc.fieldName !== "";

                var sep = getUnicodeHeaderSeparator(j, row, colBreaks.currentRow[rowStr.length]);
                var joinChar = hasHeaderBar ? "─" : " ";
                rowSep += new Array(doc.width + nPaddingChars).join(joinChar) + sep;
            }

            print(rowSep);
            print(rowStr + "║");

            colBreaks.currentRow = colBreaks.nextRow;
            colBreaks.nextRow = {};
        }

        printBottomHeaderRowUnicode(headerStructure, nPaddingChars);
    }

    /**
     * Print the unicode characters to separate two rows.
     */
    function printRowSepUnicode(header, noSep, rowStyle) {
        var out = rowStyle === "bottom" ? "╚" : "╟";
        Object.keys(header).forEach(function(field) {
            var width = header[field];
            var joinChar = rowStyle === "bottom" ? "═" : "─";
            out += new Array(width + 3).join(joinChar);
            var sep = rowStyle === "bottom" ? "╧" : "┼";
            out += noSep ? "─" : sep;
        });
        out = out.substring(0, out.length - 1);
        out += rowStyle === "bottom" ? "╝" : "╢";
        print(out);
    }

    /* -------------------------------- ASCII implementations --------------------------------- */

    /**
     * Print the header in ASCII format.
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
                rowStr += padPrint(doc.fieldName, doc.width, false, i === 0);
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
     * Print the ASCII characters to separate two rows.
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
     * Used to build a map representing the maximum widths of the values of each document.
     * For example, the documents:
     *   [{a: '7 chars'}, {a: {b: '7 chars', c: '13 characters'}}]
     * would produce the following map:
     *   {a: {$maxLength: 7, b: {$maxLength: 7}, c: {$maxLength: 13}}}
     *
     * We keep sub documents organized by prefix to enable us to co-locate them in the table header
     * later.
     */
    function processField(fieldWidths, field, obj) {
        // Extract the value for that field, or subfield if field is dotted
        var val = getField(obj, field);

        // Initialize to 0.
        if (!fieldWidths[field]) {
            fieldWidths[field] = {"$maxLength": 0};
        }

        if (isObject(val)) {
            // recursive case, it's a sub-doc, recurse with prefix field
            Object.keys(val).forEach(function(key) {
                processField(fieldWidths[field], key, obj[field]);
            });
        } else {
            //base case, it's just a value, count it

            if (val instanceof Array) {
                // Find largest element
                val.forEach(function(elt) {
                    var jsonedElt = tojson(elt, "" /* indent */, true /* no newlines */);
                    var eltLength = String(jsonedElt).length + "[]".length;
                    fieldWidths[field].$maxLength = Math.max(fieldWidths[field].$maxLength,
                                                             eltLength);
                });
            } else {
                var stringVal = String(val);
                var fieldLength = stringVal.length;

                // Don't count newlines towards width of field, as each line will be displayed
                // separately. Instead, use the maximum length of all lines.
                if (stringVal.indexOf("\n") !== -1) {
                    fieldLength = getMaxLineLength(stringVal);
                }

                fieldWidths[field].$maxLength = Math.max(fieldWidths[field].$maxLength,
                                                         fieldLength);
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

        // Convert from {a: {$maxLength: 12, b: {$maxLength: 10}, ...}} format to just
        // {'a': 12, 'a.b': 10, ...}. Note field paths with a common prefix will be adjacent to each
        // other in the resulting object.
        var newRes = {};
        function postProcess(currentDoc, path) {
            Object.keys(currentDoc).forEach(function(field) {
                if (field === "$maxLength") {
                    // Cap the length at MAX_FIELD_WIDTH, unless the field name is larger than that.
                    var hardCap = Math.max(config.MAX_FIELD_WIDTH, path.length);
                    // Make sure we have enough width to display field name.
                    var maxLen = Math.max(currentDoc[field], path.length);
                    newRes[path] = Math.min(maxLen, hardCap);
                } else {
                    assert(isObject(currentDoc[field]));

                    postProcess(currentDoc[field], path + "." + field);
                }
            });
        }

        Object.keys(res).forEach(function(key) {
            postProcess(res[key], key);
        });

        return newRes;
    }

    function printHeader(headerStructure, useUnicode) {
        return useUnicode ? printHeaderUnicode(headerStructure) : printHeaderAscii(headerStructure);
    }

    /**
     * Print the characters to separate two rows.
     */
    function printRowSep(header, noSep, unicodeOpts) {
        return unicodeOpts.useUnicode ? printRowSepUnicode(header, noSep, unicodeOpts.rowStyle)
                                      : printRowSepAscii(header, noSep);
    }

    /**
     * Responsible for printing one "row", corresponding to one document.
     * Note sometimes one "row" can print multiple lines, if there is an array field present,
     * or if there is a value that is long enough to wrap to multiple lines.
     */
    function printRow(header, doc, unicodeOpts, numRecurses) {
        doc = Object.merge(doc);  // Makes a copy.
        // We recurse if there's any wrapping or arrays.
        if (typeof numRecurses === "undefined") {
            numRecurses = 0;
        }

        var row = "";
        var recurseAgain = false;

        Object.keys(header).forEach(function(field, i) {
            var val = getField(doc, field, true);

            if (val === undefined) {
                row += padPrint("", header[field], unicodeOpts.useUnicode, i === 0);
                return;
            }

            if (val instanceof Array) {
                // Arrays will print on multiple lines
                var lastValidIndex = val.length - 1;
                var prefix = numRecurses === 0 ? "[" : " ";
                if (numRecurses <= lastValidIndex) {
                    val = prefix + tojson(val[numRecurses], "" /* indent */, true /* no newlines */);
                    if (numRecurses < lastValidIndex) {
                        // Still more elements, need to print another line.
                        recurseAgain = true;
                        val += ",";
                    } else {
                        val += "]";
                    }
                } else {
                    val = "";
                }
            } else {
                var stringVal = String(val);

                // Two things to watch for in the non-array case: If there is a newline in a string,
                // we should split that (so that it doesn't screw up the whole table), and if the
                // string representation of the value is too long, we should split that into
                // multiple lines.
                var newlineIdx = stringVal.indexOf("\n");
                if (newlineIdx !== -1) {
                    val = stringVal.slice(0, newlineIdx);
                    setFieldIfPresent(doc,
                                      field,
                                      stringVal.slice(newlineIdx + 1, stringVal.length));
                    recurseAgain = true;
                } else {
                    val = stringVal.slice(0, header[field]);
                    setFieldIfPresent(doc, field, stringVal.slice(header[field], stringVal.length));
                    recurseAgain = recurseAgain || getField(doc, field) !== "";
                }
            }

            row += padPrint(val, header[field], unicodeOpts.useUnicode, i === 0);  // Fills in |'s
        });

        row += unicodeOpts.useUnicode ? "║" : "|";  // Final border

        print(row);

        if (recurseAgain) {
            printRow(header, doc, unicodeOpts, numRecurses + 1);
        } else {  // Done, print the divider between rows
            printRowSep(header, false, unicodeOpts);
        }
    }

    /**
     * Given a map of field names to max widths, the documents to display, and the sparator between
     * them, print a tabular view of the documents.
     */
    function printTable(header, docs, opts) {
        // var header = sortedHeader(data);
        var useUnicode = opts === undefined ? true : !opts.ascii;
        var headerStructure = makeHeaderStructure(header);
        printHeader(headerStructure, useUnicode);
        docs.forEach(function(doc, i) {
            printRow(header, docs[i],
                     {useUnicode: useUnicode,
                      rowStyle: i === docs.length - 1 ? "bottom" : "middle"});
        });
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
