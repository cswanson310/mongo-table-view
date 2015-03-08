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

    // support for .table() method on cursors
    internal.DBQuery.prototype.table = function() {
        return tabularView.apply(this, []);
    };
});
