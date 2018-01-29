// ============================================================
// Many to Many examples
// ============================================================

const Sequelize = require('sequelize');
const sequelize = new Sequelize('database', 'username', 'password', {
    host: 'localhost',
    dialect: 'sqlite',
    storage: '/tmp/temp-database.sqlite'
});

const Role = sequelize.define('role', {
    name: {
        type: Sequelize.STRING
    }
});

const User = sequelize.define('user', {
    name: {
        type: Sequelize.STRING
    }
});


Role.belongsToMany(User, { through: 'userRole' });
User.belongsToMany(Role, { through: 'userRole' });

let newUser = null;
let newRole = null;

sequelize.sync({ force: true })
    .then(() => Role.create({ name: 'Role 1' }))
    .then(x => newRole = x)
    .then(() => User.create({ name: 'User 1' }))
    .then(x => newUser = x)
    .then(() => {
        console.log(`newUser: ${newUser.name}`);
        console.log(`newRole: ${newRole.name}`);
        newUser.addRole(newRole);
    })


// ============================================================
// Instance methods and Class methods
// ============================================================
const Model = sequelize.define('Model', {
    ...
});

// Class Method
Model.associate = function(models) {
    ...associate the models
};

// Instance Method
Model.prototype.someMethod = function() {.. }