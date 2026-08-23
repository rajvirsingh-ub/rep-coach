// A localized library mapping form flaws to specific technical corrections
const FORM_CORRECTIONS_DATABASE: Record<string, string[]> = {
  "knees caving inward": [
    "3x10 Banded Goblet Squats (focus on driving knees out)",
    "2 sets x 30 sec Couch Stretch per side",
    "10 Glute Bridges with a resistance band around knees"
  ],
  "heels lifting": [
    "2 min Weighted Ankle Dorsiflexion Stretch per side",
    "3x12 Calf Raises with a slow eccentric lower",
    "Foam roll calves and plantar fascia"
  ],
  "excessive forward lean": [
    "3x10 Thoracic Spine Extensions on a foam roller",
    "2x10 Goblet Squats holding a weight out in front to stay upright",
    "Hip Flexor activations"
  ],
  "butt wink": [
    "3x8 Cat-Cow stretches focusing on pelvic tilt control",
    "Hamstring flexibility drills",
    "Supported deep squat holds focusing on maintaining a flat lower back"
  ],
  "elbow flare": [
    "3x12 Band Pull-Aparts to reinforce scapular control",
    "2x10 Tricep Pushdowns with elbows pinned to your sides for tactile feedback",
    "Shoulder external rotation activation drills"
  ],
  "incomplete range of motion": [
    "2x10 Slow-tempo reps focusing on a full lockout and a full stretch",
    "Banded Tricep Extensions emphasizing end-range control",
    "Overhead Tricep Stretch, 30 sec per side"
  ],
  "hips sagging": [
    "3x30 sec Front Plank focusing on a dead-flat spine",
    "2x10 Dead Bugs to reinforce anti-extension core control",
    "Bird Dogs, 3x8 per side for core stability under load"
  ],
  "shoulder drift": [
    "2x10 Tricep Pushdowns with shoulders pinned against a wall for tactile feedback",
    "Scapular Depression Holds, 3x20 sec",
    "Light-weight Pushdowns focusing purely on elbow flexion, no shoulder movement"
  ]
};

/**
 * Simulates searching a vector store or database for technical form corrections based on detected flaws.
 * @param flaws Array of detected movement flaw strings
 * @returns Array of unique form correction recommendations
 */
export async function queryFormCorrections(flaws: string[]): Promise<string[]> {
  const recommendations: Set<string> = new Set();

  // If no specific flaws were detected, return a general baseline warm-up
  if (!flaws || flaws.length === 0) {
    return [
      "5 min general dynamic warm-up (jumping jacks, bodyweight squats)",
      "World's Greatest Stretch (3 per side)"
    ];
  }

  // Gather corrections for each matched flaw tag
  for (const flaw of flaws) {
    const normalizedFlaw = flaw.toLowerCase().trim();
    if (FORM_CORRECTIONS_DATABASE[normalizedFlaw]) {
      FORM_CORRECTIONS_DATABASE[normalizedFlaw].forEach(correction => recommendations.add(correction));
    }
  }

  // If tags didn't match anything specific, fallback to general lower body prep
  if (recommendations.size === 0) {
    return ["5 min general mobility flow", "Deep bodyweight squat holds"];
  }

  return Array.from(recommendations);
}
