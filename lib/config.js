(function (factory) {
    'use strict';

    // node
    if (module && 'exports' in module) {
        module.exports = factory();

    // mongo shell
    } else {
        __modules.table_view['config.js'] = factory();
    }

})(function () {
    'use strict';

    // In the future, global vars and the like can live here.
    return {
        MAX_FIELD_WIDTH: new ObjectId().toString().length
    };
});
