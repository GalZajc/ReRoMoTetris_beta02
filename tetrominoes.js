// --- Tetromino Definitions ---

const COLORS = [
    null, '#00FFFF', '#FFFF00', '#800080', '#00FF00', '#FF0000', '#0000FF', '#FFA500'
]; // 0: Empty, 1:I, 2:O, 3:T, 4:S, 5:Z, 6:J, 7:L

// Base shapes (Rotation State 0) and their pivot point offset.
// IMPORTANT: The pivot is relative to the piece's (r, phi) origin.
// The offsets are [dr, dphi] from the piece's origin (r, phi).
// One block should ideally have offset [0, 0] and represent the pivot.

const BASE_SHAPES = {
    // Type 1: I piece
    1: {
        // Pivot: Conceptually between the middle two blocks for horizontal.
        // Let's make the 2nd block the pivot (0,0) for easier calculation.
        // Blocks relative to pivot: (0,-1), (0,0), (0,1), (0,2)
        // Adjusting spawn might be needed if pivot isn't centered.
        pivot: { r: 0, phi: 0.5 }, // Pivot between 2nd and 3rd block horizontally
        blocks: [
            { r: 0, phi: -1 }, { r: 0, phi: 0 }, { r: 0, phi: 1 }, { r: 0, phi: 2 }
        ]
         // Alternative I-Piece centered pivot (requires fractional phi offsets):
         // pivot: { r: 0, phi: 0 },
         // blocks: [
         //    { r: 0, phi: -1.5 }, { r: 0, phi: -0.5 }, { r: 0, phi: 0.5 }, { r: 0, phi: 1.5 }
         // ] // This makes rotation math cleaner but grid snapping complex. Let's stick to integer offsets first.
    },
    // Type 2: O piece - Pivot doesn't matter much as it doesn't rotate meaningfully
    2: {
        pivot: { r: 0.5, phi: 0.5 }, // Center of the 2x2 block
        blocks: [
            { r: 0, phi: 0 }, { r: 0, phi: 1 }, { r: 1, phi: 0 }, { r: 1, phi: 1 }
        ]
    },
    // Type 3: T piece - Pivot is the center block of the horizontal bar
    3: {
        pivot: { r: 0, phi: 0 },
        blocks: [
            { r: 0, phi: -1 }, { r: 0, phi: 0 }, { r: 0, phi: 1 }, { r: 1, phi: 0 } // Pointing 'down' (outward)
        ]
    },
    // Type 4: S piece - Pivot often the 'middle right' block
    4: {
        pivot: { r: 1, phi: 0 }, // Pivot is lower-middle block
        blocks: [
            { r: 0, phi: 1 }, { r: 0, phi: 0 }, { r: 1, phi: 0 }, { r: 1, phi: -1 }
        ]
    },
    // Type 5: Z piece - Pivot often the 'middle left' block
    5: {
        pivot: { r: 1, phi: 0 }, // Pivot is lower-middle block
        blocks: [
            { r: 0, phi: -1 }, { r: 0, phi: 0 }, { r: 1, phi: 0 }, { r: 1, phi: 1 }
        ]
    },
    // Type 6: J piece - Pivot is the 'bend' block
    6: {
        pivot: { r: 1, phi: 0 }, // Pivot is the center block of the 3-in-a-row part
        blocks: [
            { r: 0, phi: -1 }, // The tail
            { r: 1, phi: -1 }, { r: 1, phi: 0 }, { r: 1, phi: 1 } // The bar
        ]
    },
    // Type 7: L piece - Pivot is the 'bend' block
    7: {
         pivot: { r: 1, phi: 0 }, // Pivot is the center block of the 3-in-a-row part
        blocks: [
            { r: 0, phi: 1 }, // The tail
            { r: 1, phi: -1 }, { r: 1, phi: 0 }, { r: 1, phi: 1 } // The bar
        ]
    }
};

// Helper to get the raw block offsets for a given type and rotation state
function getBlockOffsets(type, rotation) {
    const baseShape = BASE_SHAPES[type];
    if (!baseShape) return [];

    // O piece doesn't rotate
    if (type === 2) return baseShape.blocks;

    let currentBlocks = baseShape.blocks;

    // Apply rotation N times
    // Treat [dr, dphi] like [x, y] for rotation calculation. This is an approximation.
    // Pivot offset is ignored here as blocks are already relative to the piece origin (r,phi)
    // Rotation happens *around* the piece's origin.
    const numRotations = ((rotation % 4) + 4) % 4;
    for (let i = 0; i < numRotations; i++) {
        let rotatedBlocks = [];
        currentBlocks.forEach(block => {
            // FIXED: Changed to anti-clockwise rotation: (x, y) -> (-y, x)
            rotatedBlocks.push({ r: block.phi, phi: -block.r });
        });
        currentBlocks = rotatedBlocks;
    }

    return currentBlocks;
}
