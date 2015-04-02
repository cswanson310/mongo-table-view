// loader for Mongo shell (dar be globals!)
// Thanks Justin (https://github.com/justinjmoses/mongo-views/blob/master/index.js)

// as loader has no return ability, we need a global to bind to
var __modules = {
    table_view: { }
};

// Note: __CURDIR is set by the Makefile to ensure module loading works relative to this path

function require(relPath) {
    'use strict';

    var moduleName = relPath.replace(/^[\.\/]+/, '');

    if (!(moduleName in __modules.table_view)) {
        load(__CURDIR + '/lib/' + moduleName);
    }

    return __modules.table_view[moduleName];
}

(function (internals) {
    'use strict';

    load(__CURDIR + '/lib/init.js');

    print('mongo-table-view is initiating!');

    __modules.table_view['init.js'](internals);

})({ DBQuery: DBQuery, DBCommandCursor: DBCommandCursor });
