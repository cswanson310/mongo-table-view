mongo-table-view
================
#Overview

This module adds a `.table()` function to the mongo cursor in the shell, giving a layout much like MySQL's table view:
```
> db.foo.insert({
    type: 'demoDocument',
    metadata: { sub: 'document', two: 'fields'},
    arrayField: [1,2,'string']
})
> db.foo.insert({
    type: 'demoDocument2',
    metadata: { sub: 'doc', two: 'xx'},
    arrayField: [0, 2],
    other: 'A few more words'
})
> db.foo.find({}, {_id: 0}).table()
+-----------------------------------------------------------------------------+
|            | metadata                    |                  |               |
|            |-----------------------------|                  |               |
| arrayField | metadata.sub | metadata.two | other            | type          |
+------------+--------------+--------------+------------------+---------------+
| 1,         | document     | fields       |                  | demoDocument  |
| 2,         |              |              |                  |               |
| string     |              |              |                  |               |
+------------+--------------+--------------+------------------+---------------+
| 0,         | doc          | xx           | A few more words | demoDocument2 |
| 2          |              |              |                  |               |
+------------+--------------+--------------+------------------+---------------+
```
The method works on any type of cursor, so you can still add any sorting, skipping, or limiting you need to.

#Installation
1) Setup
- In POSIX environments, run make

- In WinX environments, please add mongorc.js to your MongoDB installation folder (if it doesn't exist) and copy the contents of index.js into it, amending setting the __CURDIR global to the full path of this mongo-table-view folder.

2) Next time you enter the mongo shell, the `.table()` method will be available on all cursors.
