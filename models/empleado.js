const mongoose = require('mongoose');

const empleadoSchema = new mongoose.Schema({
    rut: { 
        type: String, 
        required: true,
        unique: true 
    },
    nombre: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true,
        unique: true 
    },
    pass: { 
        type: String, 
        required: true 
    },
    cargo: { 
        type: String, 
        required: true 
    }
});

module.exports = mongoose.model('Empleado', empleadoSchema);