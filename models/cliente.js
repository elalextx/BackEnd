const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
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
    direccion: {
        type: String,
        required: false
    },
    comuna: {
        type: String,
        required: false
    },
    provincia: {
        type: String,
        required: false
    },
    region: {
        type: String,
        required: false
    },
    fechaNacimiento: {
        type: Date,
        required: false
    },
    sexo: {
        type: String,
        enum: ['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'],
        required: false
    },
    telefono: {
        type: String,
        required: false
    },
    historialCompras: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Compra' 
    }],
    estado: { 
        type: String, 
        default: 'pendiente' 
    }
});

module.exports = mongoose.model('Cliente', clienteSchema);