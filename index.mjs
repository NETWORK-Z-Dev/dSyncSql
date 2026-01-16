import mysql from "mysql2/promise";

export default class dSyncSql {
    constructor(host, user, pass, db, connectionLimit = 10) {
        if(!host) throw new Error('host address is required');
        if(!user) throw new Error('username is required');
        if(!pass) throw new Error('password is required');
        if(!db) throw new Error('database is required');

        this.pool = mysql.createPool({
            host: host,
            user: user,
            password: pass,
            database: db,
            waitForConnections: true,
            connectionLimit: connectionLimit,
            queueLimit: 0,
            typeCast: function (field, next) {
                if (field.type === "TINY" && field.length === 1) {
                    return field.string() === "1";
                }
                return next();
            },
        });
    }

    async waitForConnection() {
        while (true) {
            try {
                let conn = await this.pool.getConnection();
                await conn.ping();
                conn.release();
                return;
            } catch {
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    }

    async queryDatabase(query, params, retryCount = 3) {
        let connection;

        try {
            connection = await this.pool.getConnection();
            const [results,] = await connection.execute(query, params);
            return results;
        } catch (err) {
            if (err.code === 'ER_LOCK_DEADLOCK' && retryCount > 0) {
                Logger.warn('Deadlock detected, retrying transaction...', retryCount);
                // wait for a short period before retrying
                await new Promise(resolve => setTimeout(resolve, 100));
                return this.queryDatabase(query, params, retryCount - 1);
            } else {
                Logger.error('SQL Error executing query:');
                Logger.error(err);
                throw err;
            }
        } finally {
            if (connection) connection.release();
        }
    }

    async checkAndCreateTable(table) {
        const query = `
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = ?
              AND table_name = ?
        `;

        try {
            const results = await this.queryDatabase(query, [serverconfig.serverinfo.sql.database, table.name]);
            const tableExists = results[0]['COUNT(*)'] > 0;

            if (tableExists) {
                await this.checkAndCreateColumns(table);
            } else {
                await this.createTable(table);
            }
        } catch (err) {
            Logger.error('Error in checkAndCreateTable:', err);
        }
    }

    async checkAndCreateColumns(table) {
        const query = `
            SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_DEFAULT
            FROM information_schema.columns
            WHERE table_schema = ?
              AND table_name = ?
        `;

        try {
            const results = await this.queryDatabase(query, [serverconfig.serverinfo.sql.database, table.name]);
            const existingColumns = results.map(row => row.COLUMN_NAME);
            const missingColumns = table.columns.filter(col => !existingColumns.includes(col.name));

            if (missingColumns.length > 0) {
                console.log(`Adding missing columns to table "${table.name}":`, missingColumns);
                await this.addMissingColumns(table.name, missingColumns);
            } else {
                //console.log(`All columns in table "${table.name}" are up to date.`);
            }
        } catch (err) {
            Logger.error('Error in checkAndCreateColumns:', err);
        }
    }

    async createTable(table) {
        const columnsDefinition = table.columns.map(col => `${col.name} ${col.type}`).join(', ');
        const createTableQuery = mysql.format(
            `
                CREATE TABLE ??
                (
                    ${columnsDefinition}
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE =utf8mb4_general_ci
            `,
            [table.name]
        );

        try {
            console.log('Executing CREATE TABLE query:', createTableQuery);
            await this.queryDatabase(createTableQuery);

            console.log(`Table "${table.name}" created successfully.`);
            if (table.keys) {
                await this.addKeys(table);
            }
            if (table.autoIncrement) {
                await this.addAutoIncrement(table);
            }
        } catch (err) {
            Logger.error('Error in createTable:', err);
        }
    }

    async addMissingColumns(tableName, columns) {
        const alter = columns
            .map(col => `ADD COLUMN ${col.name} ${col.type}`)
            .join(", ");

        const query = mysql.format(
            `ALTER TABLE ?? ${alter}`,
            [tableName]
        );

        await this.queryDatabase(query);
    }


    async addKeys(table) {
        const keysQueries = table.keys.map(key => `ADD ${key.name} ${key.type}`).join(', ');
        const keysQuery = mysql.format(
            `ALTER TABLE ?? ${keysQueries}`,
            [table.name]
        );

        try {
            console.log('Executing ADD KEYS query:', keysQuery);
            await this.queryDatabase(keysQuery);
        } catch (err) {
            Logger.error('Error in addKeys:', err);
        }
    }


    async addAutoIncrement(table) {
        const autoIncrementQuery = mysql.format(
            `ALTER TABLE ?? MODIFY ${table.autoIncrement}`,
            [table.name]
        );

        try {
            console.log('Executing AUTO_INCREMENT query:', autoIncrementQuery);
            await this.queryDatabase(autoIncrementQuery);
        } catch (err) {
            Logger.error('Error in addAutoIncrement:', err);
        }
    }
}
