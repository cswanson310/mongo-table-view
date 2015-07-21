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
    other: 'A very long string. It goes on and on and on and on and on and on.......'
})
```
![Unicode table][0]
Or, if you prefer the ascii style:
![Ascii table][1]

The method works on any type of cursor, so you can still add any sorting, skipping, or limiting you need to.

__Note__: to prevent the table from getting exceedingly wide, field widths are capped, as seen above. Overflow is wrapped.

#Installation
1) Setup
- In POSIX environments, run make

- In WinX environments, please add mongorc.js to your MongoDB installation folder (if it doesn't exist) and copy the contents of index.js into it, amending setting the __CURDIR global to the full path of this mongo-table-view folder.

2) Next time you enter the mongo shell, the `.table()` method will be available on all cursors.

[0]: https://raw.githubusercontent.com/cswanson310/mongo-table-view/master/_assets/screenshot0.png
[1]: https://raw.githubusercontent.com/cswanson310/mongo-table-view/master/_assets/screenshot1.png
