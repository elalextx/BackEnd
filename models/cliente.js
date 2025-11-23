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