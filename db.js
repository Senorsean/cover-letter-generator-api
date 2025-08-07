const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './mydb.sqlite'
  },
  useNullAsDefault: true
});

const bcrypt = require('bcrypt');

async function initializeDatabase() {
  try {
    const tableExists = await knex.schema.hasTable('users');
    if (!tableExists) {
      await knex.schema.createTable('users', (table) => {
        table.increments('id');
        table.string('username').unique().notNullable();
        table.string('password').notNullable();
      });
      console.log('Table "users" created.');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error; // Propagate the error to stop the server start if DB fails
  }
}

async function ensureDefaultUser() {
  try {
    const defaultUser = await knex('users').where({ username: 'Anthearhdevia' }).first();
    if (!defaultUser) {
      console.log('Default user not found, creating it...');
      const hashedPassword = await bcrypt.hash('R@@tcoverletter2025*', 10);
      await knex('users').insert({ username: 'Anthearhdevia', password: hashedPassword });
      console.log('Default user "Anthearhdevia" created.');
    } else {
      console.log('Default user "Anthearhdevia" already exists.');
    }
  } catch (error) {
    console.error('Error ensuring default user exists:', error);
  }
}

module.exports = { knex, initializeDatabase, ensureDefaultUser };