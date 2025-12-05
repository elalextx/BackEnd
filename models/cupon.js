const mongoose = require('mongoose');

const cuponSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    porcentaje: {
        type: Number,
        required: true,
        min: 1,
        max: 100
    },
    descuentoFijo: {
        type: Number,
        min: 0
    },
    tipo: {
        type: String,
        enum: ['porcentaje', 'fijo'],
        default: 'porcentaje'
    },
    fechaInicio: {
        type: Date,
        required: true
    },
    fechaFin: {
        type: Date,
        required: true
    },
    usosMaximos: {
        type: Number,
        default: 1
    },
    usosActuales: {
        type: Number,
        default: 0
    },
    activo: {
        type: Boolean,
        default: true
    },
    minimoCompra: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Cupon', cuponSchema);