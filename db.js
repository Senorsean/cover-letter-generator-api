const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './mydb.sqlite'
  },
  useNullAsDefault: true
});

async function initializeDatabase() {
  try {
    await knex.schema.hasTable('users').then(exists => {
      if (!exists) {
        return knex.schema.createTable('users', table => {
          table.increments('id').primary();
          table.string('username').unique().notNullable();
          table.string('password').notNullable();
        });
      }
    });
    console.log('Database initialized and user table ensured.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

module.exports = { knex, initializeDatabase };