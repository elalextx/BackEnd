const mongoose = require("mongoose");

const ReembolsoSchema = new mongoose.Schema({
    compraId: {
        type: String,
        required: true
    },
    motivo: {
        type: String,
        required: true
    },
    estado: {
        type: String,
        default: "Pendiente"
    },
    fechaSolicitud: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Reembolso", ReembolsoSchema);
