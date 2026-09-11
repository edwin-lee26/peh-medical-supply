/**
 * ============================================================
 *  PEH Medical Supply — js/data.js
 * ------------------------------------------------------------
 *  Default categories and default products (offline seed data).
 *
 *  This file is the SOURCE OF TRUTH for the default catalog.
 *  Admin-added / edited / deleted products are stored separately
 *  in LocalStorage and merged on top of these defaults (see app.js).
 *
 *  To add a new product later, just add one object to the
 *  DEFAULT_PRODUCTS array below — no HTML editing required.
 *  To add a new category, add one object to DEFAULT_CATEGORIES
 *  and give your products a matching `category` name.
 * ============================================================
 */

/* ------------------------------------------------------------------
   DEPARTMENTS
   The list of department tabs shown in admin and (optionally) on
   the customer-facing pages.  Each category and order belongs to
   exactly one department.
------------------------------------------------------------------- */
const DEFAULT_DEPARTMENTS = ['UCC', 'PUCC'];

/* ------------------------------------------------------------------
   CATEGORIES
   `id`         : short stable key (also used as the URL slug)
   `name`       : display name — MUST match the `category` field of products
   `icon`       : Font Awesome 6 free solid icon class
   `color`      : accent color (hex) used for the category icon, cards and
                  product-card media backgrounds.  Pick any 6-digit hex.
   `department` : 'UCC' or 'PUCC' — which department this category belongs to
   `order`      : integer — controls the display sequence within the department
   NOTE: The list can be extended freely (e.g. a 14th / 15th category).
------------------------------------------------------------------- */
const DEFAULT_CATEGORIES = [
    // ---- UCC ----
    { id: "ecg",          name: "ECG",                      icon: "fa-heart-pulse",           color: "#ef4444", department: "UCC", order: 0 },
    { id: "cannulation",  name: "Cannulation",              icon: "fa-hand-holding-medical",  color: "#8b5cf6", department: "UCC", order: 1 },
    { id: "ett",          name: "ETT",                      icon: "fa-wind",                  color: "#06b6d4", department: "UCC", order: 2 },
    { id: "idc",          name: "IDC",                      icon: "fa-water",                 color: "#3b82f6", department: "UCC", order: 3 },
    { id: "suction",      name: "Suction",                  icon: "fa-tornado",               color: "#14b8a6", department: "UCC", order: 4 },
    { id: "oxygen",       name: "Oxygen",                   icon: "fa-lungs",                 color: "#0ea5e9", department: "UCC", order: 5 },
    { id: "biohazard",    name: "Biohazard",                icon: "fa-biohazard",             color: "#e11d48", department: "UCC", order: 6 },

    // ---- PUCC ----
    { id: "needles",      name: "Needles",                  icon: "fa-syringe",               color: "#f59e0b", department: "PUCC", order: 7 },
    { id: "syringe",      name: "Syringe",                  icon: "fa-vial",                  color: "#22c55e", department: "PUCC", order: 8 },
    { id: "drips",        name: "Drips",                    icon: "fa-fill-drip",             color: "#6366f1", department: "PUCC", order: 9 },
    { id: "thermoscan",   name: "Thermoscan",               icon: "fa-temperature-half",      color: "#f97316", department: "PUCC", order: 10 },
    { id: "forms",        name: "Forms",                    icon: "fa-file-prescription",     color: "#64748b", department: "PUCC", order: 11 },
    { id: "others",       name: "Others",                   icon: "fa-boxes-stacked",         color: "#78716c", department: "PUCC", order: 12 },
    { id: "miscellaneous",name: "Others / Miscellaneous",   icon: "fa-box-open",              color: "#a855f7", department: "PUCC", order: 13 }
];

/* ------------------------------------------------------------------
   PRODUCTS
   Field guide:
     id/code    : unique product code (e.g. "ECG-001")
     name       : product display name
     category   : must match a DEFAULT_CATEGORIES `name`
     department : MUST match the matching category's department
     description: short description
     unit       : Box / Each / Roll / Bag / Pad / Pack / Set ...
     stock      : current stock level (0 = out of stock)
     image      : '' (empty) or an image URL for the product card
     order      : integer — display sequence within the category
   NOTE: These are DEMO products only. Stock values were chosen to
         demonstrate all three stock states (Normal / Low / Out).
------------------------------------------------------------------- */
const DEFAULT_PRODUCTS = [
    /* ---- ECG (UCC) ---- */
    { id: "ECG-001", code: "ECG-001", name: "Adult ECG Electrode",      category: "ECG", department: "UCC", description: "Adult ECG electrode pads for general monitoring.", unit: "Box", stock: 100, image: "", parLevel: 100, order: 0 },
    { id: "ECG-002", code: "ECG-002", name: "Paediatric ECG Electrode", category: "ECG", department: "UCC", description: "Paediatric ECG electrodes for smaller patients.",     unit: "Box", stock: 80,  image: "", parLevel: 80, order: 1 },
    { id: "ECG-003", code: "ECG-003", name: "ECG Paper Roll",           category: "ECG", department: "UCC", description: "Thermal ECG recording paper for 12-lead machines.",   unit: "Roll", stock: 60, image: "", parLevel: 60, order: 2 },

    /* ---- Cannulation (UCC) ---- */
    { id: "CAN-001", code: "CAN-001", name: "IV Cannula 18G", category: "Cannulation", department: "UCC", description: "18 gauge IV cannula with introducer needle.",   unit: "Box", stock: 50, image: "", parLevel: 50, order: 0 },
    { id: "CAN-002", code: "CAN-002", name: "IV Cannula 20G", category: "Cannulation", department: "UCC", description: "20 gauge IV cannula — standard adult size.",      unit: "Box", stock: 75, image: "", parLevel: 75, order: 1 },
    { id: "CAN-003", code: "CAN-003", name: "IV Cannula 22G", category: "Cannulation", department: "UCC", description: "22 gauge IV cannula for paediatric / elderly use.", unit: "Box", stock: 90, image: "", parLevel: 90, order: 2 },

    /* ---- ETT (UCC) ---- */
    { id: "ETT-001", code: "ETT-001", name: "Endotracheal Tube 7.0mm",      category: "ETT", department: "UCC", description: "Cuffed endotracheal tube, size 7.0 mm.",   unit: "Each", stock: 40, image: "", parLevel: 40, order: 0 },
    { id: "ETT-002", code: "ETT-002", name: "Endotracheal Tube 7.5mm",      category: "ETT", department: "UCC", description: "Cuffed endotracheal tube, size 7.5 mm.",   unit: "Each", stock: 35, image: "", parLevel: 35, order: 1 },
    { id: "ETT-003", code: "ETT-003", name: "Stylet for Endotracheal Tube", category: "ETT", department: "UCC", description: "Stylet to guide endotracheal tube placement.", unit: "Each", stock: 20, image: "", parLevel: 20, order: 2 },

    /* ---- IDC (UCC) ---- */
    { id: "IDC-001", code: "IDC-001", name: "Foley Catheter 16Fr",  category: "IDC", department: "UCC", description: "Silicone Foley catheter with 10ml balloon, 16 Fr.", unit: "Each", stock: 30, image: "", parLevel: 30, order: 0 },
    { id: "IDC-002", code: "IDC-002", name: "Foley Catheter 18Fr",  category: "IDC", department: "UCC", description: "Silicone Foley catheter with 10ml balloon, 18 Fr.", unit: "Each", stock: 25, image: "", parLevel: 25, order: 1 },
    { id: "IDC-003", code: "IDC-003", name: "Urine Drainage Bag 2L",category: "IDC", department: "UCC", description: "Sterile urine drainage bag, 2 litre capacity.",      unit: "Each", stock: 45, image: "", parLevel: 45, order: 2 },

    /* ---- Suction (UCC) ---- */
    { id: "SUC-001", code: "SUC-001", name: "Suction Catheter 14Fr", category: "Suction", department: "UCC", description: "Sterile suction catheter, 14 Fr.",    unit: "Box",   stock: 60, image: "", parLevel: 60, order: 0 },
    { id: "SUC-002", code: "SUC-002", name: "Suction Canister 1L",   category: "Suction", department: "UCC", description: "Single-use suction canister, 1 litre.", unit: "Each",  stock: 15, image: "", parLevel: 15, order: 1 },
    { id: "SUC-003", code: "SUC-003", name: "Suction Tubing 3m",     category: "Suction", department: "UCC", description: "Flexible suction tubing, 3 metres.",    unit: "Each",  stock: 55, image: "", parLevel: 55, order: 2 },

    /* ---- Oxygen (UCC) ---- */
    { id: "OXY-001", code: "OXY-001", name: "Nasal Cannula Adult", category: "Oxygen", department: "UCC", description: "Adult nasal oxygen cannula, 2 metres tubing.", unit: "Each", stock: 70, image: "", parLevel: 70, order: 0 },
    { id: "OXY-002", code: "OXY-002", name: "Oxygen Mask Adult",   category: "Oxygen", department: "UCC", description: "Adult oxygen mask, medium concentration.",    unit: "Each", stock: 65, image: "", parLevel: 65, order: 1 },
    { id: "OXY-003", code: "OXY-003", name: "Oxygen Tubing 2m",    category: "Oxygen", department: "UCC", description: "Oxygen delivery tubing, 2 metres.",          unit: "Each", stock: 18, image: "", parLevel: 20, order: 2 },

    /* ---- Biohazard (UCC) ---- */
    { id: "BIO-001", code: "BIO-001", name: "Sharps Container 1L",     category: "Biohazard", department: "UCC", description: "Puncture-resistant sharps container, 1L.",    unit: "Each",  stock: 8,  image: "", parLevel: 10, order: 0 },
    { id: "BIO-002", code: "BIO-002", name: "Biohazard Waste Bag 60L", category: "Biohazard", department: "UCC", description: "Yellow biohazard waste bags, 60 litre.",       unit: "Box",   stock: 12, image: "", parLevel: 15, order: 1 },
    { id: "BIO-003", code: "BIO-003", name: "Clinical Waste Bag 30L",  category: "Biohazard", department: "UCC", description: "Yellow clinical waste bags, 30 litre.",        unit: "Box",   stock: 110,image: "", parLevel: 110, order: 2 },

    /* ---- Needles (PUCC) ---- */
    { id: "NDL-001", code: "NDL-001", name: "Hypodermic Needle 21G", category: "Needles", department: "PUCC", description: "Sterile hypodermic needles, 21 G.", unit: "Box", stock: 120, image: "", parLevel: 120, order: 0 },
    { id: "NDL-002", code: "NDL-002", name: "Hypodermic Needle 23G", category: "Needles", department: "PUCC", description: "Sterile hypodermic needles, 23 G.", unit: "Box", stock: 110, image: "", parLevel: 110, order: 1 },
    { id: "NDL-003", code: "NDL-003", name: "Hypodermic Needle 25G", category: "Needles", department: "PUCC", description: "Sterile hypodermic needles, 25 G.", unit: "Box", stock: 105, image: "", parLevel: 105, order: 2 },

    /* ---- Syringe (PUCC) ---- */
    { id: "SYR-001", code: "SYR-001", name: "Syringe 5ml",  category: "Syringe", department: "PUCC", description: "Disposable 5 ml luer-slip syringes.",  unit: "Box", stock: 200, image: "", parLevel: 200, order: 0 },
    { id: "SYR-002", code: "SYR-002", name: "Syringe 10ml", category: "Syringe", department: "PUCC", description: "Disposable 10 ml luer-slip syringes.", unit: "Box", stock: 180, image: "", parLevel: 180, order: 1 },
    { id: "SYR-003", code: "SYR-003", name: "Syringe 20ml", category: "Syringe", department: "PUCC", description: "Disposable 20 ml luer-lock syringes.", unit: "Box", stock: 150, image: "", parLevel: 150, order: 2 },

    /* ---- Drips (PUCC) ---- */
    { id: "DRP-001", code: "DRP-001", name: "IV Giving Set",            category: "Drips", department: "PUCC", description: "IV infusion giving set with spike.",           unit: "Set", stock: 85, image: "", parLevel: 85, order: 0 },
    { id: "DRP-002", code: "DRP-002", name: "IV Solution 500ml (NS)",   category: "Drips", department: "PUCC", description: "0.9% Sodium Chloride infusion, 500 ml.",       unit: "Bag", stock: 95, image: "", parLevel: 95, order: 1 },
    { id: "DRP-003", code: "DRP-003", name: "IV Solution 1000ml (D5W)", category: "Drips", department: "PUCC", description: "5% Dextrose infusion, 1000 ml.",              unit: "Bag", stock: 90, image: "", parLevel: 90, order: 2 },

    /* ---- Thermoscan (PUCC) ---- */
    { id: "THR-001", code: "THR-001", name: "Thermoscan Probe Cover", category: "Thermoscan", department: "PUCC", description: "Disposable probe covers for thermoscan.",  unit: "Box",  stock: 140, image: "", parLevel: 140, order: 0 },
    { id: "THR-002", code: "THR-002", name: "Digital Thermometer",    category: "Thermoscan", department: "PUCC", description: "Digital clinical thermometer.",           unit: "Each", stock: 50,  image: "", parLevel: 50, order: 1 },
    { id: "THR-003", code: "THR-003", name: "Thermoscan Probe",       category: "Thermoscan", department: "PUCC", description: "Replacement thermoscan probe tip.",      unit: "Each", stock: 0,   image: "", parLevel: 40, order: 2 },

    /* ---- Forms (PUCC) ---- */
    { id: "FOR-001", code: "FOR-001", name: "Medication Chart A4",        category: "Forms", department: "PUCC", description: "A4 medication administration record.", unit: "Pad", stock: 80, image: "", parLevel: 80, order: 0 },
    { id: "FOR-002", code: "FOR-002", name: "Patient Observation Chart",  category: "Forms", department: "PUCC", description: "Vital signs observation chart.",         unit: "Pad", stock: 75, image: "", parLevel: 75, order: 1 },
    { id: "FOR-003", code: "FOR-003", name: "Stock Requisition Form",     category: "Forms", department: "PUCC", description: "Internal stock requisition slips.",       unit: "Pad", stock: 95, image: "", parLevel: 95, order: 2 },

    /* ---- Others (PUCC) ---- */
    { id: "OTH-001", code: "OTH-001", name: "Surgical Gloves (Latex) M", category: "Others", department: "PUCC", description: "Sterile latex surgical gloves, medium.", unit: "Box",  stock: 130, image: "", parLevel: 130, order: 0 },
    { id: "OTH-002", code: "OTH-002", name: "Surgical Gloves (Latex) L", category: "Others", department: "PUCC", description: "Sterile latex surgical gloves, large.",   unit: "Box",  stock: 125, image: "", parLevel: 125, order: 1 },
    { id: "OTH-003", code: "OTH-003", name: "Alcohol Swabs (Pack 100)",  category: "Others", department: "PUCC", description: "Pre-soaked isopropyl alcohol swabs.",      unit: "Pack", stock: 160, image: "", parLevel: 160, order: 2 },

    /* ---- Others / Miscellaneous (PUCC) ---- */
    { id: "MSC-001", code: "MSC-001", name: "Disposable Apron",  category: "Others / Miscellaneous", department: "PUCC", description: "Waterproof disposable aprons.",   unit: "Pack", stock: 70,  image: "", parLevel: 70, order: 0 },
    { id: "MSC-002", code: "MSC-002", name: "Gauze Swabs 7.5cm", category: "Others / Miscellaneous", department: "PUCC", description: "Sterile gauze swabs, 7.5 cm.",   unit: "Box",  stock: 140, image: "", parLevel: 140, order: 1 },
    { id: "MSC-003", code: "MSC-003", name: "Tape Roll 1 inch",  category: "Others / Miscellaneous", department: "PUCC", description: "Medical adhesive tape, 1 inch.", unit: "Roll", stock: 100, parLevel: 100, image: "", order: 2 }
];
