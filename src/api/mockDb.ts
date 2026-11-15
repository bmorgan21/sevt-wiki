import type { Car, Folder, Memberships, Profile, Subteam } from '../types';

export interface FolderRow extends Folder { deletedAt: string | null }
export interface PageRow {
  id: string;
  carId: string | null;
  subteamId: string;
  folderId: string | null;
  title: string;
  content: string;
  tags: string[];
  externalLink: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt: string | null;
}
export interface RevisionRow {
  pageId: string;
  version: number;
  title: string;
  content: string;
  tags: string[];
  externalLink: string;
  createdAt: string;
  authorId: string;
  note?: string;
}
export interface Db {
  cars: Car[];
  subteams: Subteam[];
  profiles: Profile[];
  memberships: Record<string, Memberships>;
  folders: FolderRow[];
  pages: PageRow[];
  revisions: RevisionRow[];
}

const F = '```';

const BUDGET = String.raw`Welcome to the confidential executive overview for the **Solar Electric Vehicle** team.

## Key Allocations
- **Battery Pack Cells**: \$14,000
- **Carbon Fiber Prepreg**: \$8,500
- **Logistics & Shipping**: \$3,200

> **Note:** All purchases require prior approval from the Treasurer.

Here is our expenditure limit formula:

$$\sum_{i=1}^{n} \text{Cost}_i \leq \$50{,}000$$

${F}json
{
  "season": "2026",
  "target_event": "American Solar Challenge",
  "status": "Approved"
}
${F}
`;

const AERO_GUIDE = String.raw`High-level aerodynamic philosophy for the Solstice car.

Always maintain attached flow over the main fairing body.`;

const AERO_CFD = String.raw`This page outlines our Computational Fluid Dynamics (CFD) results for the Solstice fairing.

## Summary of Results
- **Drag Coefficient ($C_d$)**: 0.115
- **Downforce at 60 km/h**: 140 N

Here is the aerodynamic drag force equation:

$$F_d = \frac{1}{2} \rho v^2 C_d A$$

### Python CFD calculation script
${F}python
# Sample lift/drag calculation script
def calculate_efficiency(drag, velocity):
    power = 0.5 * 1.225 * (velocity ** 3) * 0.115 * 1.5
    return power

print(f"Required power: {calculate_efficiency(16.6, 60):.2f} W")
${F}

| Condition | Cd | Notes |
|-----------|-------|-------------------|
| Baseline  | 0.121 | Initial fairing   |
| Revised   | 0.115 | Smoothed canopy   |

[CAD Model Repository (External)](https://drive.google.com/drive/mock-cad-solstice)`;

const BMS = String.raw`Our custom modular BMS architecture uses LTC6813 monitoring ICs connected via isoSPI.

## Safety Thresholds
- **Max Cell Voltage**: 4.20V
- **Min Cell Voltage**: 2.80V
- **Max Temperature**: 60°C

$$\text{State of Charge (SoC)} = \frac{Q_{\text{remaining}}}{Q_{\text{rated}}} \times 100\%$$

### BMS initialization firmware (C++)
${F}cpp
#include <LTC6813.h>

void setupBMS() {
    Serial.begin(115200);
    ltc6813_init(BMS_CS_PIN);
    configure_cell_thresholds(4.20, 2.80);
}

void loop() {
    float packVoltage = readTotalVoltage();
    if (packVoltage < 90.0) {
        triggerFaultState();
    }
}
${F}

Make sure to review the wiring harness schematic before soldering.`;

export function createSeedDb(): Db {
  const db: Db = {
    cars: [
      { id: 'car-solstice', name: 'Solstice', status: 'Active' },
      { id: 'car-gemini', name: 'Gemini', status: 'Concept' },
      { id: 'car-legacy', name: 'Aurora (Legacy)', status: 'Legacy' },
    ],
    subteams: [
      { id: 'sub-exec', name: 'Exec & Leadership', restricted: true, globalOnly: true },
      { id: 'sub-ops', name: 'Operations & Logistics', restricted: false, globalOnly: true },
      { id: 'sub-aero', name: 'Aero', restricted: false, globalOnly: false },
      { id: 'sub-battery', name: 'Battery', restricted: false, globalOnly: false },
      { id: 'sub-powertrain', name: 'Powertrain', restricted: false, globalOnly: false },
    ],
    profiles: [
      { id: 'u1', name: 'Riley Vance', email: 'riley@sev.mit.edu', systemRole: 'admin', status: 'active' },
      { id: 'u2', name: 'Alex Rivera', email: 'alex@sev.mit.edu', systemRole: 'user', status: 'active' },
      { id: 'u3', name: 'Jordan Lee', email: 'jordan@sev.mit.edu', systemRole: 'user', status: 'active' },
      { id: 'u4', name: 'Taylor Swift', email: 'taylor@sev.mit.edu', systemRole: 'user', status: 'active' },
      { id: 'u5', name: 'Dan Okafor', email: 'dan@sev.mit.edu', systemRole: 'user', status: 'deactivated' },
    ],
    memberships: {
      u1: { 'sub-exec': 'lead', 'sub-aero': 'lead', 'sub-battery': 'lead', 'sub-powertrain': 'lead', 'sub-ops': 'lead' },
      u2: { 'sub-aero': 'lead', 'sub-battery': 'viewer', 'sub-ops': 'viewer' },
      u3: { 'sub-battery': 'editor', 'sub-aero': 'editor', 'sub-ops': 'viewer' },
      u4: { 'sub-ops': 'viewer' },
      u5: {},
    },
    folders: [
      { id: 'f-exec-budget', carId: null, subteamId: 'sub-exec', parentId: null, name: 'Budgets & Financials', deletedAt: null },
      { id: 'f-sol-aero-wind', carId: 'car-solstice', subteamId: 'sub-aero', parentId: null, name: 'Wind Tunnel Data', deletedAt: null },
      { id: 'f-sol-bat-schematics', carId: 'car-solstice', subteamId: 'sub-battery', parentId: null, name: 'Schematics', deletedAt: null },
      { id: 'f-sol-bat-hv', carId: 'car-solstice', subteamId: 'sub-battery', parentId: 'f-sol-bat-schematics', name: 'High Voltage', deletedAt: null },
    ],
    pages: [],
    revisions: [],
  };

  type Seed = Omit<PageRow, 'version' | 'deletedAt'>;
  const addPage = (row: Seed, earlier: Array<{ content: string; at: string; by: string }> = []) => {
    const base = { title: row.title, tags: row.tags, externalLink: row.externalLink };
    const history = [
      ...earlier.map(e => ({ content: e.content, createdAt: e.at, authorId: e.by, ...base })),
      { content: row.content, createdAt: row.updatedAt, authorId: row.updatedBy, ...base },
    ];
    history.forEach((h, i) => db.revisions.push({ pageId: row.id, version: i + 1, ...h }));
    db.pages.push({ ...row, version: history.length, deletedAt: null });
  };

  addPage(
    {
      id: 'p-exec-1', subteamId: 'sub-exec', carId: null, folderId: 'f-exec-budget',
      title: 'FY2026 Season Budget & Sponsorship Plan', content: BUDGET,
      tags: ['budget', 'exec', 'sponsorship'], externalLink: 'https://docs.google.com/spreadsheets/d/mock-budget-link',
      createdAt: '2026-01-15T10:00:00Z', createdBy: 'u1', updatedAt: '2026-02-01T14:30:00Z', updatedBy: 'u1',
    },
    [{ content: 'Initial budget draft.', at: '2026-01-15T10:00:00Z', by: 'u1' }],
  );
  addPage({
    id: 'p-sol-aero-root', subteamId: 'sub-aero', carId: 'car-solstice', folderId: null,
    title: 'Aero General Guidelines', content: AERO_GUIDE, tags: ['aero', 'guidelines'], externalLink: '',
    createdAt: '2026-02-05T09:15:00Z', createdBy: 'u2', updatedAt: '2026-02-05T09:15:00Z', updatedBy: 'u2',
  });
  addPage(
    {
      id: 'p-sol-aero-1', subteamId: 'sub-aero', carId: 'car-solstice', folderId: 'f-sol-aero-wind',
      title: 'Solstice Drag Coefficient & CFD Analysis', content: AERO_CFD,
      tags: ['aero', 'solstice', 'cfd', 'simulation'], externalLink: 'https://drive.google.com/mock-cad-solstice',
      createdAt: '2026-02-10T09:15:00Z', createdBy: 'u2', updatedAt: '2026-02-20T11:45:00Z', updatedBy: 'u3',
    },
    [{ content: 'Draft CFD results.\n\n- Drag Coefficient: 0.121', at: '2026-02-10T09:15:00Z', by: 'u2' }],
  );
  addPage({
    id: 'p-sol-bat-1', subteamId: 'sub-battery', carId: 'car-solstice', folderId: 'f-sol-bat-hv',
    title: 'Battery Management System (BMS) Architecture', content: BMS,
    tags: ['battery', 'bms', 'solstice', 'hardware'], externalLink: '',
    createdAt: '2026-02-12T14:20:00Z', createdBy: 'u3', updatedAt: '2026-02-12T14:20:00Z', updatedBy: 'u3',
  });

  return db;
}
