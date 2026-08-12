# dSyncSql

dSyncSql is supposed to be a helper for handling MySQL / MariaDB connections and executing queries. In addition it will also allow you to automatically create a database's structure like tables, column and such and will automatically create missing columns and tables based off a json Object.

------

## Connection setup

The library was made with the intent to always create a connection pool.

```js
import dSyncSql from "@hackthedev/dsync-sql"

export let db = new dSyncSql({
    host: "127.0.0.1",
    port: 3306, // optional, default 3306
    user: "username",
    password: "some_password",
    database: "database_name",
    waitForConnections: true, // optional
    connectionLimit: 10, // optional
    queueLimit: 0, // optional
});
```

------

## Defining a database

The following is optional but dSyncSql was designed to automatically create the database structure to make deployment and updates smooth and automatic. 

> [!WARNING]
>
> The library wont create the database itself.

```js
const tables = [
    {
        name: "network_servers",
        columns: [
            {name: "id", type: "int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY"},
            {name: "address", type: "varchar(255) NOT NULL UNIQUE KEY"},
            {name: "status", type: "varchar(255) NOT NULL"},
            {name: "data", type: "longtext"},
            {name: "last_sync", type: "datetime NULL"},
        ]
    }
]
```

You could then loop through the tables object and create the tables and columns automatically using `checkAndCreateTable`.

```js
for (const table of tables) {
    await db.checkAndCreateTable(table);
}
```

------

## Running Queries

You can also run manual queries to your heart's desire using `queryDatabase`. The function also handles `ER_LOCK_DEADLOCK` errors and will retry to execute a statement 3 times on default

```js
await db.queryDatabase(
    "SELECT * FROM network_servers WHERE stats = ?", 
    ["verified"]
);

// with custom retry counter
await db.queryDatabase(
    "SELECT * FROM network_servers WHERE stats = ?", 
    ["verified"], 
    10
);
```

