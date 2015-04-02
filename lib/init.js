(function (factory) {
    'use strict';

    // node
    if (module && 'exports' in module) {
        module.exports = factory;

    // mongo shell
    } else {
        __modules.table_view['init.js'] = factory;
    }

})(function (internal) {
    'use strict';

    var tabularView = require('./tableView.js');
    var table = function(opts) {
        return tabularView.apply(this, [opts]);
    };

    // support for .table() method on cursors, including DBCommandCursor used by aggregation
    internal.DBQuery.prototype.table = table;
    internal.DBCommandCursor.prototype.table = table;
});
