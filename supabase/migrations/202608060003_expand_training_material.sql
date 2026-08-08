update public.training_modules
set lessons = $json$
[
  {
    "title": "Meet the piece families",
    "body": "Learn to recognise the available Girih piece families by their outlines, angles, and edge lengths before building a pattern.",
    "duration": 10,
    "steps": [
      "Open the piece library and place one example from each available family in an empty area of the stage.",
      "Rotate each piece and compare its acute, right, and obtuse corners. Notice which edges have matching lengths.",
      "Move two pieces together without snapping and predict which edges should form a clean join.",
      "Turn snapping on, test your prediction, and keep a small reference group of compatible pieces beside the working area."
    ]
  },
  {
    "title": "Place and navigate",
    "body": "Establish a controlled centre and learn the views needed to inspect alignment while the pattern grows.",
    "duration": 10,
    "steps": [
      "Clear the working area and place one piece at the centre of the stage as the pattern anchor.",
      "Use orbit view to inspect the piece, then return to top view for precise planar alignment.",
      "Zoom in until adjoining edges are easy to compare, then zoom out to check the overall centre.",
      "Select, move, and rotate the anchor once, then undo the change so you know how to recover from an incorrect placement."
    ]
  },
  {
    "title": "Snap a repeat",
    "body": "Build one complete ring by repeating a compatible placement around the centre and checking every connection.",
    "duration": 15,
    "steps": [
      "Enable snapping and attach the first surrounding piece to one full edge of the centre piece.",
      "Repeat the same piece and rotation around the centre, working in one direction instead of filling random gaps.",
      "After each placement, zoom in and confirm that the two adjoining edges meet without overlap or daylight.",
      "Close the final gap. If the last piece does not fit, step backward to the first join that changed angle or edge length."
    ]
  },
  {
    "title": "Refine and export",
    "body": "Use colour and boundary checks to make the completed rosette readable, then preserve a reviewable result.",
    "duration": 10,
    "steps": [
      "Choose a restrained palette with one dominant colour and one contrasting colour for the repeated ring.",
      "Apply colours consistently to equivalent pieces so the rotational rhythm remains visible.",
      "Inspect the centre, every snapped join, and the outside boundary in top view; correct gaps and accidental overlaps.",
      "Save the model with a clear name and create a preview export that shows the entire rosette without cropping."
    ]
  }
]$json$::jsonb,
estimated_minutes = 45,
updated_at = now()
where slug = 'girih-foundations' and owner_id is null;

update public.training_modules
set lessons = $json$
[
  {
    "title": "Choose a bond",
    "body": "Compare basic running, stacked, and alternating arrangements and choose a bond that can repeat across a wall.",
    "duration": 8,
    "steps": [
      "Open a blank Bricks workspace and identify the controls for brick size, joint width, row count, and row offset.",
      "Preview a stacked bond with aligned vertical joints, then a running bond with alternating row offsets.",
      "Compare how each option transfers loads visually and where continuous vertical joints appear.",
      "Select the running or alternating structure you will develop for the assessment."
    ]
  },
  {
    "title": "Set the module",
    "body": "Define brick dimensions and mortar joints before adding complexity so the repeat is based on consistent measurements.",
    "duration": 10,
    "steps": [
      "Set a brick length and height, keeping the length greater than the height for a conventional horizontal unit.",
      "Set one consistent joint width and verify that both horizontal and vertical joints remain visible.",
      "Create at least four rows and inspect whether every brick retains the same dimensions.",
      "Record the brick length and joint width because the row offset must relate to this module."
    ]
  },
  {
    "title": "Build the repeat",
    "body": "Offset alternating rows and test both sides of the panel to confirm that the bond repeats continuously.",
    "duration": 14,
    "steps": [
      "Keep the first row unshifted and offset the second row by half a brick module or another deliberate fraction.",
      "Repeat the first-row setting on row three and the second-row setting on row four.",
      "Inspect the left and right boundaries; bricks leaving one side should continue correctly when the panel repeats.",
      "Correct partial units or offset values until the horizontal repeat closes without a jump in the joint pattern."
    ]
  },
  {
    "title": "Colour and save",
    "body": "Apply two materials without hiding the bond logic, inspect the wall preview, and save the final panel.",
    "duration": 8,
    "steps": [
      "Assign a primary material colour to most bricks and a secondary colour to a deliberate repeating subset.",
      "Check that colour repetition follows the bond instead of producing isolated, accidental accents.",
      "Open the wall preview and inspect joint consistency, row alignment, and repeat continuity at a useful scale.",
      "Save the pattern with a clear name and retain a preview or share reference for assessment submission."
    ]
  }
]$json$::jsonb,
estimated_minutes = 40,
updated_at = now()
where slug = 'bricks-foundations' and owner_id is null;

update public.training_modules
set lessons = $json$
[
  {
    "title": "Read a cell",
    "body": "Identify the top face, underside, attachment edges, and vertical direction of a muqarnas cell before assembly.",
    "duration": 10,
    "steps": [
      "Place one cell by itself and orbit around it to distinguish its visible face from its underside.",
      "Locate the edges intended to connect to neighbouring cells and compare their lengths and directions.",
      "Switch between side, underside, and perspective views to understand the cell's vertical orientation.",
      "Duplicate the cell and practise aligning one compatible attachment edge without building a full tier."
    ]
  },
  {
    "title": "Start the first tier",
    "body": "Create a stable base tier with consistent radial spacing and a clear centre for the transition above.",
    "duration": 12,
    "steps": [
      "Place the first base cell at a consistent distance from the intended centre of the composition.",
      "Duplicate or add matching cells around the centre while maintaining the same height and radial distance.",
      "Use top view to compare the gaps between cells and adjust them until the rhythm is even.",
      "Orbit below the tier and confirm that attachment edges meet cleanly and all cells face the same vertical direction."
    ]
  },
  {
    "title": "Add a transition",
    "body": "Build a second tier that connects to the base and narrows or redirects the geometry toward the centre.",
    "duration": 18,
    "steps": [
      "Select a transition cell whose lower attachment edges are compatible with two neighbouring base cells.",
      "Place the first transition above the base and inspect the connection from both outside and underside views.",
      "Repeat the transition around the tier, keeping every cell at the same level and orientation.",
      "Resolve collisions and open seams before closing the ring; do not hide an incorrect connection inside the assembly."
    ]
  },
  {
    "title": "Inspect in 3D",
    "body": "Review the complete two-tier assembly from all critical viewpoints and save a model that can be assessed.",
    "duration": 10,
    "steps": [
      "Orbit around the outside and check that the silhouette and spacing remain balanced on both sides.",
      "Inspect the underside for disconnected edges, reversed cells, collisions, or abrupt height changes.",
      "Check the central transition from top view and confirm that it reads as one intentional focal point.",
      "Save the assembly with a clear name and capture a view that shows both tiers and their connections."
    ]
  }
]$json$::jsonb,
estimated_minutes = 50,
updated_at = now()
where slug = 'muqarnas-foundations' and owner_id is null;

update public.training_modules
set lessons = $json$
[
  {
    "title": "Set the architectural frame",
    "body": "Establish the bay width, height, centreline, and primary opening before placing decorative assets.",
    "duration": 12,
    "steps": [
      "Start a blank composition and define the overall width and height of one architectural bay.",
      "Place a centreline and horizontal reference levels for the springing line, opening head, and top boundary.",
      "Set the primary opening inside the frame, leaving enough solid area to support surrounding ornament.",
      "Inspect the elevation at a distance and correct proportions before adding detailed assets."
    ]
  },
  {
    "title": "Place shared assets",
    "body": "Add versioned Girih, brick, or muqarnas assets from the shared library and place them deliberately in the frame.",
    "duration": 14,
    "steps": [
      "Open the shared asset library and choose one surface asset, such as a Girih panel or brick pattern.",
      "Place and scale the surface asset within a clearly bounded part of the bay without distorting its proportions.",
      "Choose a second asset type, such as a muqarnas assembly, and position it at an architecturally plausible transition.",
      "Confirm the selected asset versions and avoid placing duplicate geometry in the same location."
    ]
  },
  {
    "title": "Compose the elevation",
    "body": "Align surfaces and organise the opening, structure, and ornament into a clear visual hierarchy.",
    "duration": 17,
    "steps": [
      "Align the primary surfaces to the bay axes and reference levels instead of positioning them only by eye.",
      "Keep the opening as the dominant element and use ornamental density to reinforce, not obscure, its outline.",
      "Check that adjacent materials meet at intentional boundaries and that no asset floats in front of its host surface.",
      "Compare the left and right sides, then correct accidental imbalance while retaining any deliberate asymmetry."
    ]
  },
  {
    "title": "Review the space",
    "body": "Evaluate the bay in elevation and perspective, correct spatial conflicts, and preserve the final project.",
    "duration": 12,
    "steps": [
      "Review the elevation for proportions, alignment, edge conditions, and the hierarchy of architectural elements.",
      "Switch to perspective and inspect depth, surface intersections, and whether ornament sits on the intended plane.",
      "Remove hidden duplicates and correct gaps, collisions, or assets extending beyond the bay boundary.",
      "Save the project with a clear name and capture one elevation and one perspective view for review."
    ]
  }
]$json$::jsonb,
estimated_minutes = 55,
updated_at = now()
where slug = 'mehraz-foundations' and owner_id is null;
