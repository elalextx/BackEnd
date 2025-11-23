const mongoose = require('mongoose');
const usuarioSchema = new mongoose.Schema({
    nombre: String,
    email: String,
    pass: String,
    rut: String,
    fechaRegistro: { type: Date, default: Date.now },
    perfilTipo: { 
        type: String, 
        enum: ['Cliente', 'Empleado'], 
        required: true 
    },
    perfil: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'perfilTipo' 
    }
});

module.exports = mongoose.model('Usuario', usuarioSchema);