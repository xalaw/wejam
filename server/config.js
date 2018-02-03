module.exports.DATABASE_URL= process.env.DATABASE_URL || global.DATABASE_URL || 
`mongodb://${process.env.USER_NAME}:${process.env.PASSWORD}@ds221148.mlab.com:21148/symphesis` || `mongodb://localhost/orcasynth`;

module.exports.PORT= process.env.PORT || 3001 
