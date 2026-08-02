import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// 1 jednostka w Three.js = 1 cm
const WIDTH = 35;
const DEPTH = 80;
const HEIGHT = 74;
const BOARD = 1.8; // płyta melaminowana 18 mm
const HALF_DEPTH = DEPTH / 2; // 40 cm

// Blat
let selectedTopWidth = 140;
let selectedHelperSide = 'left';
let selectedTopFinish = 'white';
let selectedHelperFinish = 'white';
let selectedTopBand = false;
let selectedFrameFinish = 'black';
let selectedCableGrommet = false;
let cableGrommetFlapOpen = false;

const cableGrommetPosition = { x: 0, z: -27 };
let cableGrommetGroup = null;
let cableGrommetFlapPivot = null;
let cableGrommetInteractiveMeshes = [];
const TOP_DEPTH = 80;
const TOP_THICKNESS = 1.8; // płyta melaminowana 18 mm
const TOP_BAND_HEIGHT = 10;

// Przepust metalowy: wymiar zewnętrzny 16 × 6,8 cm.
// Otwór w płycie jest mniejszy i pozostaje widoczny również od spodu.
const CABLE_GROMMET_WIDTH = 16;
const CABLE_GROMMET_DEPTH = 6.8;
const CABLE_CUTOUT_WIDTH = 14.8;
const CABLE_CUTOUT_DEPTH = 5.4;
const CABLE_GROMMET_HEIGHT = 0.55;
const CABLE_GROMMET_FRAME = 0.6;
const CABLE_GROMMET_CLEARANCE = 1.3;

// Stelaż prawy
const FRAME_PROFILE = 4.0; // 4 x 4 cm

// Szafa
const WARDROBE_WIDTH = 40;
const WARDROBE_DEPTH = 40;
const WARDROBE_HEIGHT = 189;
const WARDROBE_BOARD = 1.8; // płyta melaminowana 18 mm
const WARDROBE_HDF_BACK = 0.3; // płyta HDF 3 mm
const WARDROBE_SHELF_COUNT = 4;
const WARDROBE_HANDLE_LENGTH = 10; // L = 100 mm
const WARDROBE_HINGE_COUNT = 3;
const WARDROBE_HINGE_OPEN_ANGLE = THREE.MathUtils.degToRad(100);
const WARDROBE_BASE_PRICE = 1130;
const WARDROBE_BACK_SURCHARGE = 200;
let selectedWardrobeBack = 'hdf';
let selectedWardrobeHandle = 'gray';
let selectedWardrobeFinish = 'white';
let wardrobeDoorOpen = false;

// Układ osi:
// X — szerokość
// Y — wysokość
// Z — głębokość
// Front otwartego modułu: +Z
// Otwór modułu tylnego: -X

const app = document.querySelector('#app');

// Aktywny widok portfolio: ekran startowy, konfigurator biurka lub szafy.
// Szafa ma własny model 3D i panel konfiguracji, a wspólna scena zachowuje podłogę, kamerę i kostkę widoku.
let activeProduct = 'start';


// ============================================================
// SCENA
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f3f5);

function getAppViewportSize() {
  const rect = app.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || window.innerWidth)),
    height: Math.max(1, Math.round(rect.height || window.innerHeight))
  };
}

const initialViewport = getAppViewportSize();
const camera = new THREE.PerspectiveCamera(
  38,
  initialViewport.width / initialViewport.height,
  0.1,
  1200
);
camera.position.set(10, 102, 205);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(initialViewport.width, initialViewport.height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
app.appendChild(renderer.domElement);

// Podczas przeciągania przepustu pokazujemy jego bieżące położenie
// względem lewej i tylnej krawędzi blatu.
const cablePositionIndicator = document.createElement('div');
cablePositionIndicator.className = 'cable-position-indicator';
cablePositionIndicator.setAttribute('aria-hidden', 'true');
cablePositionIndicator.innerHTML = `
  <strong>Położenie przepustu</strong>
  <span data-cable-position-width></span>
  <span data-cable-position-depth></span>
`;
app.appendChild(cablePositionIndicator);

const cablePositionWidth = cablePositionIndicator.querySelector('[data-cable-position-width]');
const cablePositionDepth = cablePositionIndicator.querySelector('[data-cable-position-depth]');
const cableIndicatorWorldPosition = new THREE.Vector3();

function formatCablePositionCm(value) {
  return value.toFixed(1).replace('.', ',');
}

function updateCablePositionIndicator() {
  if (!cableDragging || !selectedCableGrommet) {
    cablePositionIndicator.classList.remove('is-visible');
    return;
  }

  const fromLeft = cableGrommetPosition.x + selectedTopWidth / 2;
  const fromBack = cableGrommetPosition.z + TOP_DEPTH / 2;

  cablePositionWidth.textContent = `Szer.: ${formatCablePositionCm(fromLeft)} cm od lewej`;
  cablePositionDepth.textContent = `Gł.: ${formatCablePositionCm(fromBack)} cm od tyłu`;

  cablePositionIndicator.classList.add('is-visible');

  // Etykieta podąża za przepustem w rzucie ekranu, ale jest odsunięta
  // do góry, żeby na telefonie nie zasłaniał jej palec.
  const rect = app.getBoundingClientRect();
  cableIndicatorWorldPosition
    .set(
      cableGrommetPosition.x,
      HEIGHT + TOP_THICKNESS + CABLE_GROMMET_HEIGHT + 1.2,
      cableGrommetPosition.z
    )
    .project(camera);

  const projectedX = (cableIndicatorWorldPosition.x * 0.5 + 0.5) * rect.width;
  const projectedY = (-cableIndicatorWorldPosition.y * 0.5 + 0.5) * rect.height;
  const badgeWidth = cablePositionIndicator.offsetWidth || 190;
  const badgeHeight = cablePositionIndicator.offsetHeight || 66;
  const margin = 10;

  const left = THREE.MathUtils.clamp(
    projectedX - badgeWidth / 2,
    margin,
    Math.max(margin, rect.width - badgeWidth - margin)
  );
  const top = THREE.MathUtils.clamp(
    projectedY - badgeHeight - 24,
    margin,
    Math.max(margin, rect.height - badgeHeight - margin)
  );

  cablePositionIndicator.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, HEIGHT * 0.55, 0);
controls.minDistance = 100;
controls.maxDistance = 360;
controls.maxPolarAngle = Math.PI * 0.49;

// Widok początkowy: maksymalnie oddalony, od frontu i lekko pod kątem.
const initialViewDirection = new THREE.Vector3(0.30, 0.25, 1).normalize();
camera.position
  .copy(controls.target)
  .add(initialViewDirection.multiplyScalar(controls.maxDistance));
camera.lookAt(controls.target);
controls.update();

// ============================================================
// OŚWIETLENIE
// ============================================================
scene.add(new THREE.AmbientLight(0xffffff, 1.35));
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b9198, 1.45));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(-95, 155, 120);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -220;
keyLight.shadow.camera.right = 220;
keyLight.shadow.camera.top = 180;
keyLight.shadow.camera.bottom = -180;
scene.add(keyLight);

const frontFill = new THREE.DirectionalLight(0xfff7ed, 1.0);
frontFill.position.set(120, 75, 145);
scene.add(frontFill);

const undersideFill = new THREE.PointLight(0xffffff, 85, 320, 2);
undersideFill.position.set(0, 28, 85);
scene.add(undersideFill);

// ============================================================
// TEKSTURA PŁYTY
// ============================================================
const textureLoader = new THREE.TextureLoader();
const finishPaths = {
  white: './finish-white.jpg',
  beige: './finish-beige.jpg',
  chocolate: './finish-chocolate.jpg'
};

const finishTextures = {};
const finishMaterialSets = {};

function loadFinishTexture(path) {
  const texture = textureLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function createTextureVariant(baseTexture, rotation = 0) {
  const texture = baseTexture.clone();
  texture.needsUpdate = true;
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function createFinishMaterialSet(path) {
  const baseTexture = loadFinishTexture(path);
  const verticalTexture = createTextureVariant(baseTexture, Math.PI / 2);
  const horizontalTexture = createTextureVariant(baseTexture, 0);

  const verticalMaterial = new THREE.MeshStandardMaterial({
    map: verticalTexture,
    color: 0xffffff,
    roughness: 0.76,
    metalness: 0,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: verticalTexture,
    emissiveIntensity: 0.055
  });

  const horizontalMaterial = new THREE.MeshStandardMaterial({
    map: horizontalTexture,
    color: 0xffffff,
    roughness: 0.76,
    metalness: 0,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: horizontalTexture,
    emissiveIntensity: 0.055
  });

  return [
    verticalMaterial,
    verticalMaterial,
    horizontalMaterial,
    horizontalMaterial,
    verticalMaterial,
    verticalMaterial
  ];
}

Object.entries(finishPaths).forEach(([key, path]) => {
  finishMaterialSets[key] = createFinishMaterialSet(path);
});

const boardMaterials = finishMaterialSets.white;

const edgeMaterial = new THREE.LineBasicMaterial({
  color: 0x8f887b,
  transparent: true,
  opacity: 0.24
});

const frameMaterials = {
  black: new THREE.MeshStandardMaterial({
    color: 0x252628,
    roughness: 0.42,
    metalness: 0.55
  }),
  white: new THREE.MeshStandardMaterial({
    color: 0xf2f2ef,
    roughness: 0.48,
    metalness: 0.38
  })
};

const frameEdgeMaterials = {
  black: new THREE.LineBasicMaterial({
    color: 0x17181a,
    transparent: true,
    opacity: 0.30
  }),
  white: new THREE.LineBasicMaterial({
    color: 0xa5a6a3,
    transparent: true,
    opacity: 0.34
  })
};

const cableGrommetMaterial = new THREE.MeshStandardMaterial({
  color: 0x1c1d1f,
  roughness: 0.32,
  metalness: 0.74
});

const cableGrommetInnerMaterial = new THREE.MeshStandardMaterial({
  color: 0x08090a,
  roughness: 0.76,
  metalness: 0.12
});

const cableGrommetBrushMaterial = new THREE.MeshStandardMaterial({
  color: 0x030303,
  roughness: 1.0,
  metalness: 0
});

const wardrobeHdfMaterial = new THREE.MeshStandardMaterial({
  color: 0xd2cec3,
  roughness: 0.92,
  metalness: 0
});

const wardrobeHandleMaterials = {
  gray: new THREE.MeshStandardMaterial({
    color: 0x8f9499,
    roughness: 0.38,
    metalness: 0.68
  }),
  white: new THREE.MeshStandardMaterial({
    color: 0xf2f2ef,
    roughness: 0.46,
    metalness: 0.36
  }),
  black: new THREE.MeshStandardMaterial({
    color: 0x252628,
    roughness: 0.40,
    metalness: 0.58
  })
};


const wardrobeHingeMaterial = new THREE.MeshStandardMaterial({
  color: 0xcac2b6,
  roughness: 0.34,
  metalness: 0.82
});

const wardrobeHingeAccentMaterial = new THREE.MeshStandardMaterial({
  color: 0x8c867b,
  roughness: 0.56,
  metalness: 0.52
});

const model = new THREE.Group();
scene.add(model);

const helperGroup = new THREE.Group();
helperGroup.name = 'Pomocnik';
model.add(helperGroup);

const wardrobeModel = new THREE.Group();
wardrobeModel.name = 'Szafa';
wardrobeModel.visible = false;
scene.add(wardrobeModel);

const wardrobeBodyGroup = new THREE.Group();
wardrobeBodyGroup.name = 'Korpus szafy';
wardrobeModel.add(wardrobeBodyGroup);

const wardrobeBackGroup = new THREE.Group();
wardrobeBackGroup.name = 'Plecy szafy';
wardrobeModel.add(wardrobeBackGroup);

let wardrobeDoorPivot = null;
let wardrobeHandleMesh = null;
let wardrobeHandleHitMesh = null;
let wardrobeHingeParts = [];

function addBoard({ name, size, position, parent = model, materials = boardMaterials }) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.name = `${name} — krawędzie`;
  edges.position.copy(position);
  parent.add(edges);

  return mesh;
}

function createTranslatedBox(size, position) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  geometry.translate(position.x, position.y, position.z);
  return geometry;
}

// ============================================================
// SZAFA 40 × 40 × 189 CM
// ============================================================
function clearGeneratedGroup(group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    child.traverse((descendant) => {
      descendant.geometry?.dispose();
    });
  });
}

function rebuildWardrobeBack() {
  clearGeneratedGroup(wardrobeBackGroup);

  const thickness = selectedWardrobeBack === 'melamine'
    ? WARDROBE_BOARD
    : WARDROBE_HDF_BACK;
  const materials = selectedWardrobeBack === 'melamine'
    ? finishMaterialSets[selectedWardrobeFinish]
    : wardrobeHdfMaterial;

  // Plecy mieszczą się w nominalnej głębokości 40 cm.
  addBoard({
    name: selectedWardrobeBack === 'melamine'
      ? 'Plecy — płyta melaminowana 18 mm'
      : 'Plecy — płyta HDF 3 mm',
    size: new THREE.Vector3(
      WARDROBE_WIDTH - WARDROBE_BOARD * 2,
      WARDROBE_HEIGHT - WARDROBE_BOARD * 2,
      thickness
    ),
    position: new THREE.Vector3(
      0,
      WARDROBE_HEIGHT / 2,
      -WARDROBE_DEPTH / 2 + thickness / 2
    ),
    parent: wardrobeBackGroup,
    materials
  });
}

function applyWardrobeHandleFinish() {
  if (!wardrobeHandleMesh) return;
  wardrobeHandleMesh.material = wardrobeHandleMaterials[selectedWardrobeHandle];
  wardrobeHandleMesh.material.needsUpdate = true;
}

function updateWardrobeHingeVisibility() {
  const visible =
    wardrobeDoorOpen ||
    (wardrobeDoorPivot && Math.abs(wardrobeDoorPivot.rotation.y) > 0.03);

  wardrobeHingeParts.forEach((part) => {
    if (part) part.visible = Boolean(visible);
  });
}

function addWardrobeHinge(yPosition) {
  if (!wardrobeDoorPivot) return;

  const bodyMountX = -WARDROBE_WIDTH / 2 + WARDROBE_BOARD / 2 + 0.04;
  const bodyMountZ = WARDROBE_DEPTH / 2 - WARDROBE_BOARD - 2.5;

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'Zawias szafy - część korpusu';
  bodyGroup.position.set(bodyMountX, yPosition, bodyMountZ);

  const bodyPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 5.0, 3.0),
    wardrobeHingeMaterial
  );
  bodyPlate.castShadow = true;
  bodyPlate.receiveShadow = true;
  bodyGroup.add(bodyPlate);

  const bodyBlock = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.7, 2.0),
    wardrobeHingeAccentMaterial
  );
  bodyBlock.position.set(0.56, 0, -0.15);
  bodyBlock.castShadow = true;
  bodyBlock.receiveShadow = true;
  bodyGroup.add(bodyBlock);

  const armBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.85, 0.85),
    wardrobeHingeMaterial
  );
  armBase.position.set(1.7, 0, -0.65);
  armBase.castShadow = true;
  armBase.receiveShadow = true;
  bodyGroup.add(armBase);

  const bodyPivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 1.4, 18),
    wardrobeHingeAccentMaterial
  );
  bodyPivot.rotation.z = Math.PI / 2;
  bodyPivot.position.set(0.78, 0, -0.48);
  bodyPivot.castShadow = true;
  bodyPivot.receiveShadow = true;
  bodyGroup.add(bodyPivot);

  wardrobeBodyGroup.add(bodyGroup);
  wardrobeHingeParts.push(bodyGroup);

  const doorGroup = new THREE.Group();
  doorGroup.name = 'Zawias szafy - część drzwiowa';
  doorGroup.position.set(2.3, yPosition, -1.6);

  const cupPlate = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 5.0, 0.16),
    wardrobeHingeMaterial
  );
  cupPlate.castShadow = true;
  cupPlate.receiveShadow = true;
  doorGroup.add(cupPlate);

  const cupGeometry = new THREE.CylinderGeometry(1.7, 1.7, 0.62, 24);
  cupGeometry.rotateX(Math.PI / 2);
  const hingeCup = new THREE.Mesh(cupGeometry, wardrobeHingeMaterial);
  hingeCup.position.set(-0.18, 0, 0.33);
  hingeCup.castShadow = true;
  hingeCup.receiveShadow = true;
  doorGroup.add(hingeCup);

  const doorArm = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.85, 0.85),
    wardrobeHingeMaterial
  );
  doorArm.position.set(-2.35, 0, 0.08);
  doorArm.castShadow = true;
  doorArm.receiveShadow = true;
  doorGroup.add(doorArm);

  const doorJoint = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 1.2, 18),
    wardrobeHingeAccentMaterial
  );
  doorJoint.rotation.z = Math.PI / 2;
  doorJoint.position.set(-1.2, 0, -0.06);
  doorJoint.castShadow = true;
  doorJoint.receiveShadow = true;
  doorGroup.add(doorJoint);

  wardrobeDoorPivot.add(doorGroup);
  wardrobeHingeParts.push(doorGroup);
}

function buildWardrobeModel() {
  clearGeneratedGroup(wardrobeBodyGroup);
  wardrobeHingeParts = [];

  // Korpus kończy się 18 mm przed frontem. Front uzupełnia nominalną
  // głębokość szafy do 40 cm.
  const carcassDepth = WARDROBE_DEPTH - WARDROBE_BOARD;
  const carcassCenterZ = -WARDROBE_BOARD / 2;
  const innerHeight = WARDROBE_HEIGHT - WARDROBE_BOARD * 2;
  const innerWidth = WARDROBE_WIDTH - WARDROBE_BOARD * 2;
  const bodyMaterials = finishMaterialSets[selectedWardrobeFinish];

  addBoard({
    name: 'Wieniec górny 18 mm',
    size: new THREE.Vector3(WARDROBE_WIDTH, WARDROBE_BOARD, carcassDepth),
    position: new THREE.Vector3(
      0,
      WARDROBE_HEIGHT - WARDROBE_BOARD / 2,
      carcassCenterZ
    ),
    parent: wardrobeBodyGroup,
    materials: bodyMaterials
  });

  addBoard({
    name: 'Wieniec dolny 18 mm',
    size: new THREE.Vector3(WARDROBE_WIDTH, WARDROBE_BOARD, carcassDepth),
    position: new THREE.Vector3(0, WARDROBE_BOARD / 2, carcassCenterZ),
    parent: wardrobeBodyGroup,
    materials: bodyMaterials
  });

  addBoard({
    name: 'Bok lewy 18 mm',
    size: new THREE.Vector3(WARDROBE_BOARD, innerHeight, carcassDepth),
    position: new THREE.Vector3(
      -WARDROBE_WIDTH / 2 + WARDROBE_BOARD / 2,
      WARDROBE_HEIGHT / 2,
      carcassCenterZ
    ),
    parent: wardrobeBodyGroup,
    materials: bodyMaterials
  });

  addBoard({
    name: 'Bok prawy 18 mm',
    size: new THREE.Vector3(WARDROBE_BOARD, innerHeight, carcassDepth),
    position: new THREE.Vector3(
      WARDROBE_WIDTH / 2 - WARDROBE_BOARD / 2,
      WARDROBE_HEIGHT / 2,
      carcassCenterZ
    ),
    parent: wardrobeBodyGroup,
    materials: bodyMaterials
  });

  // Cztery półki dzielą wnętrze na pięć równych przestrzeni.
  for (let index = 1; index <= WARDROBE_SHELF_COUNT; index += 1) {
    const shelfY = WARDROBE_BOARD +
      (innerHeight * index) / (WARDROBE_SHELF_COUNT + 1);

    addBoard({
      name: `Półka wewnętrzna ${index} — 18 mm`,
      size: new THREE.Vector3(innerWidth, WARDROBE_BOARD, carcassDepth - 2.2),
      position: new THREE.Vector3(0, shelfY, carcassCenterZ + 0.6),
      parent: wardrobeBodyGroup,
      materials: bodyMaterials
    });
  }

  // Front i uchwyt znajdują się we wspólnej grupie z osią obrotu przy
  // lewej krawędzi. Dzięki temu kliknięcie uchwytu otwiera całe drzwi.
  const doorWidth = WARDROBE_WIDTH - 0.6;
  const doorHeight = WARDROBE_HEIGHT - 0.6;
  const doorCenterZ = WARDROBE_DEPTH / 2 - WARDROBE_BOARD / 2;
  const hingeX = -doorWidth / 2;

  wardrobeDoorPivot = new THREE.Group();
  wardrobeDoorPivot.name = 'Zawias drzwi szafy';
  wardrobeDoorPivot.position.set(hingeX, 0, doorCenterZ);
  wardrobeDoorPivot.rotation.y = wardrobeDoorOpen ? -WARDROBE_HINGE_OPEN_ANGLE : 0;
  wardrobeBodyGroup.add(wardrobeDoorPivot);

  addBoard({
    name: 'Front 18 mm',
    size: new THREE.Vector3(doorWidth, doorHeight, WARDROBE_BOARD),
    position: new THREE.Vector3(
      doorWidth / 2,
      WARDROBE_HEIGHT / 2,
      0
    ),
    parent: wardrobeDoorPivot,
    materials: bodyMaterials
  });

  const handleGeometry = new THREE.BoxGeometry(0.72, WARDROBE_HANDLE_LENGTH, 0.92);
  wardrobeHandleMesh = new THREE.Mesh(
    handleGeometry,
    wardrobeHandleMaterials[selectedWardrobeHandle]
  );
  wardrobeHandleMesh.name = 'Uchwyt krawędziowy L=100 mm';
  wardrobeHandleMesh.position.set(
    doorWidth - 0.32,
    WARDROBE_HEIGHT / 2,
    WARDROBE_BOARD / 2 + 0.16
  );
  wardrobeHandleMesh.castShadow = true;
  wardrobeHandleMesh.receiveShadow = true;
  wardrobeDoorPivot.add(wardrobeHandleMesh);

  // Niewidoczny, nieco większy obszar ułatwia trafienie w uchwyt palcem,
  // ale drzwi nadal otwierają się wyłącznie po kliknięciu przy uchwycie.
  wardrobeHandleHitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, WARDROBE_HANDLE_LENGTH + 5, 3.4),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  wardrobeHandleHitMesh.name = 'Obszar kliknięcia uchwytu';
  wardrobeHandleHitMesh.position.copy(wardrobeHandleMesh.position);
  wardrobeHandleHitMesh.userData.isWardrobeHandleHitArea = true;
  wardrobeDoorPivot.add(wardrobeHandleHitMesh);

  const hingeOffsets = [26, WARDROBE_HEIGHT / 2, WARDROBE_HEIGHT - 26];
  hingeOffsets.slice(0, WARDROBE_HINGE_COUNT).forEach((hingeY) => {
    addWardrobeHinge(hingeY);
  });

  rebuildWardrobeBack();
  applyWardrobeHandleFinish();
  updateWardrobeHingeVisibility();
}

buildWardrobeModel();

// ============================================================
// KONSTRUKCJA POMOCNIKA
// ============================================================
const xOuterLeft = -WIDTH / 2;
const xInnerLeft = xOuterLeft + BOARD;
const xOuterRight = WIDTH / 2;
const xInnerRight = xOuterRight - BOARD;

const dividerFrontFace = BOARD / 2;
const dividerRearFace = -BOARD / 2;
const rearPanelInnerFace = -HALF_DEPTH + BOARD;

const shelfY = HEIGHT / 2;
const bottomY = BOARD / 2;
const topY = HEIGHT - BOARD / 2;

// 1. Prawa ściana wspólna — pełna wysokość i pełna głębokość.
addBoard({
  name: 'Prawa ściana wspólna',
  size: new THREE.Vector3(BOARD, HEIGHT, DEPTH),
  position: new THREE.Vector3(xOuterRight - BOARD / 2, HEIGHT / 2, 0),
  parent: helperGroup
});

// 2. Lewy bok modułu przedniego — pełna wysokość.
const frontSectionDepth = HALF_DEPTH - dividerFrontFace;
const frontSectionCenterZ = (HALF_DEPTH + dividerFrontFace) / 2;

addBoard({
  name: 'Przód — lewy bok',
  size: new THREE.Vector3(BOARD, HEIGHT, frontSectionDepth),
  position: new THREE.Vector3(
    xOuterLeft + BOARD / 2,
    HEIGHT / 2,
    frontSectionCenterZ
  ),
  parent: helperGroup
});

// 3. Wspólna płyta na styku modułów.
const sharedPanelWidth = xInnerRight - xOuterLeft;

addBoard({
  name: 'Wspólna płyta środkowa',
  size: new THREE.Vector3(sharedPanelWidth, HEIGHT, BOARD),
  position: new THREE.Vector3(
    (xOuterLeft + xInnerRight) / 2,
    HEIGHT / 2,
    0
  ),
  parent: helperGroup
});

// 4. Tylna płyta końcowa — pełna wysokość.
addBoard({
  name: 'Tylna płyta końcowa',
  size: new THREE.Vector3(sharedPanelWidth, HEIGHT, BOARD),
  position: new THREE.Vector3(
    (xOuterLeft + xInnerRight) / 2,
    HEIGHT / 2,
    -HALF_DEPTH + BOARD / 2
  ),
  parent: helperGroup
});

// 5. Poziome płyty modułu przedniego.
const frontHorizontalWidth = xInnerRight - xInnerLeft;
const frontHorizontalDepth = HALF_DEPTH - dividerFrontFace;
const frontHorizontalCenterZ = (HALF_DEPTH + dividerFrontFace) / 2;

function addFrontHorizontal(name, y) {
  addBoard({
    name,
    size: new THREE.Vector3(frontHorizontalWidth, BOARD, frontHorizontalDepth),
    position: new THREE.Vector3(0, y, frontHorizontalCenterZ),
    parent: helperGroup
  });
}

addFrontHorizontal('Przód — płyta dolna', bottomY);
addFrontHorizontal('Przód — półka środkowa', shelfY);
addFrontHorizontal('Przód — płyta górna korpusu', topY);

// 6. Poziome płyty modułu tylnego.
const rearHorizontalWidth = xInnerRight - xOuterLeft;
const rearHorizontalDepth = dividerRearFace - rearPanelInnerFace;
const rearHorizontalCenterZ = (dividerRearFace + rearPanelInnerFace) / 2;

function addRearHorizontal(name, y) {
  addBoard({
    name,
    size: new THREE.Vector3(rearHorizontalWidth, BOARD, rearHorizontalDepth),
    position: new THREE.Vector3(
      (xOuterLeft + xInnerRight) / 2,
      y,
      rearHorizontalCenterZ
    ),
    parent: helperGroup
  });
}

addRearHorizontal('Tył — płyta dolna', bottomY);
addRearHorizontal('Tył — półka środkowa', shelfY);
addRearHorizontal('Tył — płyta górna korpusu', topY);

// ============================================================
// KONFIGUROWALNY BLAT I PRAWY STELAŻ
// Biurko zawsze pozostaje wyśrodkowane.
// Szerokość blatu zmienia się symetrycznie na lewo i na prawo.
// Pomocnik pozostaje przy lewej krawędzi blatu.
// ============================================================
const topCenterY = HEIGHT + TOP_THICKNESS / 2;
const topCenterZ = 0;
const configurableAssembly = new THREE.Group();
configurableAssembly.name = 'Konfigurowalne elementy biurka';
model.add(configurableAssembly);

function clearGroupGeometry(group) {
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
  });
  group.clear();

  if (group === configurableAssembly) {
    cableGrommetGroup = null;
    cableGrommetFlapPivot = null;
    cableGrommetInteractiveMeshes = [];
  }
}


function addTopBoard(topWidth, materials, withCableHole) {
  const leftEdge = -topWidth / 2;
  const rightEdge = topWidth / 2;
  const backEdge = -TOP_DEPTH / 2;
  const frontEdge = TOP_DEPTH / 2;

  // Blat bez przepustu i blat z przepustem korzystają od teraz z dokładnie
  // tej samej geometrii bazowej oraz identycznego mapowania UV. Dzięki temu
  // włączenie przepustu nie obraca, nie skaluje i nie przesuwa tekstury.
  const shape = new THREE.Shape();
  shape.moveTo(leftEdge, backEdge);
  shape.lineTo(rightEdge, backEdge);
  shape.lineTo(rightEdge, frontEdge);
  shape.lineTo(leftEdge, frontEdge);
  shape.closePath();

  if (withCableHole) {
    const holeLeft = cableGrommetPosition.x - CABLE_CUTOUT_WIDTH / 2;
    const holeRight = cableGrommetPosition.x + CABLE_CUTOUT_WIDTH / 2;
    const holeBack = cableGrommetPosition.z - CABLE_CUTOUT_DEPTH / 2;
    const holeFront = cableGrommetPosition.z + CABLE_CUTOUT_DEPTH / 2;

    const hole = new THREE.Path();
    hole.moveTo(holeLeft, holeBack);
    hole.lineTo(holeLeft, holeFront);
    hole.lineTo(holeRight, holeFront);
    hole.lineTo(holeRight, holeBack);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: TOP_THICKNESS,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });

  // Shape jest rysowany w płaszczyźnie XY, a blat leży w XZ.
  // Po obrocie grubość geometrii biegnie w osi Y.
  geometry.rotateX(Math.PI / 2);

  // Stałe mapowanie UV niezależne od tego, czy w blacie jest otwór.
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));

    let u;
    let v;

    if (ny >= nx && ny >= nz) {
      // Góra i spód.
      u = (x - leftEdge) / topWidth;
      v = (z - backEdge) / TOP_DEPTH;
    } else if (nx >= nz) {
      // Boki lewe/prawe oraz pionowe ścianki otworu.
      u = (z - backEdge) / TOP_DEPTH;
      v = (y + TOP_THICKNESS) / TOP_THICKNESS;
    } else {
      // Krawędzie przednia/tylna oraz pionowe ścianki otworu.
      u = (x - leftEdge) / topWidth;
      v = (y + TOP_THICKNESS) / TOP_THICKNESS;
    }

    uv[index * 2] = THREE.MathUtils.clamp(u, 0, 1);
    uv[index * 2 + 1] = THREE.MathUtils.clamp(v, 0, 1);
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeVertexNormals();

  const capMaterial = materials[2];
  const sideMaterial = materials[0];
  const mesh = new THREE.Mesh(geometry, [capMaterial, sideMaterial]);
  mesh.name = withCableHole
    ? `Blat ${topWidth} cm — z otworem`
    : `Blat ${topWidth} cm`;
  mesh.position.set(0, HEIGHT + TOP_THICKNESS, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  configurableAssembly.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 20),
    edgeMaterial
  );
  edges.name = `${mesh.name} — krawędzie`;
  edges.position.copy(mesh.position);
  configurableAssembly.add(edges);
}

function addTopBoardWithoutHole(topWidth, materials) {
  addTopBoard(topWidth, materials, false);
}

function addTopBoardWithHole(topWidth, materials) {
  addTopBoard(topWidth, materials, true);
}

function getCableGrommetForbiddenRectangles(topWidth) {
  const helperOnLeft = selectedHelperSide === 'left';
  const leftEdge = -topWidth / 2;
  const rightEdge = topWidth / 2;

  const helperMinX = helperOnLeft ? leftEdge : rightEdge - WIDTH;
  const helperMaxX = helperOnLeft ? leftEdge + WIDTH : rightEdge;

  const frameX = helperOnLeft
    ? rightEdge - FRAME_PROFILE / 2
    : leftEdge + FRAME_PROFILE / 2;

  const frontLegZ = TOP_DEPTH / 2 - FRAME_PROFILE / 2;
  const backLegZ = -TOP_DEPTH / 2 + FRAME_PROFILE / 2;

  return [
    {
      minX: helperMinX,
      maxX: helperMaxX,
      minZ: -TOP_DEPTH / 2,
      maxZ: TOP_DEPTH / 2
    },
    {
      minX: frameX - FRAME_PROFILE / 2,
      maxX: frameX + FRAME_PROFILE / 2,
      minZ: frontLegZ - FRAME_PROFILE / 2,
      maxZ: frontLegZ + FRAME_PROFILE / 2
    },
    {
      minX: frameX - FRAME_PROFILE / 2,
      maxX: frameX + FRAME_PROFILE / 2,
      minZ: backLegZ - FRAME_PROFILE / 2,
      maxZ: backLegZ + FRAME_PROFILE / 2
    }
  ];
}

function getCableGrommetBounds(topWidth) {
  const borderInset = CABLE_GROMMET_CLEARANCE + (selectedTopBand ? BOARD : 0);
  return {
    minX: -topWidth / 2 + CABLE_GROMMET_WIDTH / 2 + borderInset,
    maxX: topWidth / 2 - CABLE_GROMMET_WIDTH / 2 - borderInset,
    minZ: -TOP_DEPTH / 2 + CABLE_GROMMET_DEPTH / 2 + borderInset,
    maxZ: TOP_DEPTH / 2 - CABLE_GROMMET_DEPTH / 2 - CABLE_GROMMET_CLEARANCE
  };
}

function cableGrommetOverlapsRectangle(x, z, rectangle) {
  const halfWidth = CABLE_GROMMET_WIDTH / 2 + CABLE_GROMMET_CLEARANCE;
  const halfDepth = CABLE_GROMMET_DEPTH / 2 + CABLE_GROMMET_CLEARANCE;

  return (
    x + halfWidth > rectangle.minX &&
    x - halfWidth < rectangle.maxX &&
    z + halfDepth > rectangle.minZ &&
    z - halfDepth < rectangle.maxZ
  );
}

function isCableGrommetPositionValid(x, z, topWidth = selectedTopWidth) {
  const bounds = getCableGrommetBounds(topWidth);
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) {
    return false;
  }

  return !getCableGrommetForbiddenRectangles(topWidth).some((rectangle) =>
    cableGrommetOverlapsRectangle(x, z, rectangle)
  );
}

function findNearestValidCableGrommetPosition(x, z, topWidth = selectedTopWidth) {
  const bounds = getCableGrommetBounds(topWidth);
  const desiredX = THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX);
  const desiredZ = THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);

  if (isCableGrommetPositionValid(desiredX, desiredZ, topWidth)) {
    return { x: desiredX, z: desiredZ };
  }

  const step = 1.0;
  const maxRadius = Math.ceil(Math.max(topWidth, TOP_DEPTH));
  let best = null;
  let bestDistance = Infinity;

  for (let radius = step; radius <= maxRadius; radius += step) {
    const samples = Math.max(24, Math.ceil(radius * 8));
    for (let index = 0; index < samples; index += 1) {
      const angle = (index / samples) * Math.PI * 2;
      const candidateX = THREE.MathUtils.clamp(
        desiredX + Math.cos(angle) * radius,
        bounds.minX,
        bounds.maxX
      );
      const candidateZ = THREE.MathUtils.clamp(
        desiredZ + Math.sin(angle) * radius,
        bounds.minZ,
        bounds.maxZ
      );

      if (!isCableGrommetPositionValid(candidateX, candidateZ, topWidth)) continue;

      const distance =
        (candidateX - x) * (candidateX - x) +
        (candidateZ - z) * (candidateZ - z);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: candidateX, z: candidateZ };
      }
    }

    if (best) return best;
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
}

function registerCableGrommetMesh(mesh) {
  mesh.userData.cableGrommet = true;
  cableGrommetInteractiveMeshes.push(mesh);
  return mesh;
}

function addCableGrommet() {
  const topSurfaceY = HEIGHT + TOP_THICKNESS;
  const group = new THREE.Group();
  group.name = 'Przepust kablowy';
  group.position.set(cableGrommetPosition.x, topSurfaceY + 0.02, cableGrommetPosition.z);
  configurableAssembly.add(group);
  cableGrommetGroup = group;

  const outerWidth = CABLE_GROMMET_WIDTH;
  const outerDepth = CABLE_GROMMET_DEPTH;
  const frame = CABLE_GROMMET_FRAME;
  const innerWidth = outerWidth - frame * 2;
  const innerDepth = outerDepth - frame * 2;

  const addPart = (name, size, position, material, parent = group) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.name = name;
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return registerCableGrommetMesh(mesh);
  };

  // Górna ramka zakrywa krawędź rzeczywistego wycięcia.
  addPart(
    'Przepust — ramka lewa',
    new THREE.Vector3(frame, CABLE_GROMMET_HEIGHT, outerDepth),
    new THREE.Vector3(-outerWidth / 2 + frame / 2, CABLE_GROMMET_HEIGHT / 2, 0),
    cableGrommetMaterial
  );
  addPart(
    'Przepust — ramka prawa',
    new THREE.Vector3(frame, CABLE_GROMMET_HEIGHT, outerDepth),
    new THREE.Vector3(outerWidth / 2 - frame / 2, CABLE_GROMMET_HEIGHT / 2, 0),
    cableGrommetMaterial
  );
  addPart(
    'Przepust — ramka tylna',
    new THREE.Vector3(innerWidth, CABLE_GROMMET_HEIGHT, frame),
    new THREE.Vector3(0, CABLE_GROMMET_HEIGHT / 2, -outerDepth / 2 + frame / 2),
    cableGrommetMaterial
  );
  addPart(
    'Przepust — ramka przednia',
    new THREE.Vector3(innerWidth, CABLE_GROMMET_HEIGHT, frame),
    new THREE.Vector3(0, CABLE_GROMMET_HEIGHT / 2, outerDepth / 2 - frame / 2),
    cableGrommetMaterial
  );

  // Czarne ścianki przechodzą przez pełną grubość blatu, lecz środek pozostaje pusty.
  const throatTopY = -0.02;
  const throatCenterY = throatTopY - TOP_THICKNESS / 2;
  const throatThickness = 0.22;
  addPart(
    'Przepust — kanał lewy',
    new THREE.Vector3(throatThickness, TOP_THICKNESS, CABLE_CUTOUT_DEPTH),
    new THREE.Vector3(-CABLE_CUTOUT_WIDTH / 2 + throatThickness / 2, throatCenterY, 0),
    cableGrommetInnerMaterial
  );
  addPart(
    'Przepust — kanał prawy',
    new THREE.Vector3(throatThickness, TOP_THICKNESS, CABLE_CUTOUT_DEPTH),
    new THREE.Vector3(CABLE_CUTOUT_WIDTH / 2 - throatThickness / 2, throatCenterY, 0),
    cableGrommetInnerMaterial
  );
  addPart(
    'Przepust — kanał tylny',
    new THREE.Vector3(CABLE_CUTOUT_WIDTH - throatThickness * 2, TOP_THICKNESS, throatThickness),
    new THREE.Vector3(0, throatCenterY, -CABLE_CUTOUT_DEPTH / 2 + throatThickness / 2),
    cableGrommetInnerMaterial
  );
  addPart(
    'Przepust — kanał przedni',
    new THREE.Vector3(CABLE_CUTOUT_WIDTH - throatThickness * 2, TOP_THICKNESS, throatThickness),
    new THREE.Vector3(0, throatCenterY, CABLE_CUTOUT_DEPTH / 2 - throatThickness / 2),
    cableGrommetInnerMaterial
  );

  const brushDepth = 1.15;
  addPart(
    'Przepust — szczotka',
    new THREE.Vector3(innerWidth - 0.35, 0.32, brushDepth),
    new THREE.Vector3(
      0,
      CABLE_GROMMET_HEIGHT * 0.58,
      outerDepth / 2 - frame - brushDepth / 2
    ),
    cableGrommetBrushMaterial
  );

  // Klapka obraca się wokół tylnej krawędzi.
  const flapDepth = innerDepth - brushDepth - 0.28;
  const pivotZ = -outerDepth / 2 + frame + 0.12;
  const pivot = new THREE.Group();
  pivot.name = 'Przepust — zawias klapki';
  pivot.position.set(0, CABLE_GROMMET_HEIGHT + 0.03, pivotZ);
  group.add(pivot);
  cableGrommetFlapPivot = pivot;

  const flap = addPart(
    'Przepust — klapka',
    new THREE.Vector3(innerWidth - 0.18, 0.24, flapDepth),
    new THREE.Vector3(0, 0, flapDepth / 2),
    cableGrommetMaterial,
    pivot
  );
  flap.userData.cableGrommetFlap = true;
  pivot.rotation.x = cableGrommetFlapOpen ? -1.12 : 0;
}

function addTopBand(topWidth, topCenterX, topCenterZ, materials) {
  // Opaska stoi NA blacie i ma 10 cm wysokości.
  // Tworzy kształt U: lewa strona, prawa strona i tył.
  const topSurfaceY = HEIGHT + TOP_THICKNESS;
  const bandCenterY = topSurfaceY + TOP_BAND_HEIGHT / 2;
  const topLeftEdgeX = topCenterX - topWidth / 2;
  const topRightEdgeX = topCenterX + topWidth / 2;
  const topBackEdgeZ = topCenterZ - TOP_DEPTH / 2;

  const bandLeftX = topLeftEdgeX + BOARD / 2;
  const bandRightX = topRightEdgeX - BOARD / 2;
  const bandBackZ = topBackEdgeZ + BOARD / 2;
  const sideBandDepth = TOP_DEPTH;
  const backBandWidth = Math.max(1, topWidth - 2 * BOARD);

  addBoard({
    name: 'Opaska blatu — lewa',
    size: new THREE.Vector3(BOARD, TOP_BAND_HEIGHT, sideBandDepth),
    position: new THREE.Vector3(bandLeftX, bandCenterY, topCenterZ),
    parent: configurableAssembly,
    materials
  });

  addBoard({
    name: 'Opaska blatu — prawa',
    size: new THREE.Vector3(BOARD, TOP_BAND_HEIGHT, sideBandDepth),
    position: new THREE.Vector3(bandRightX, bandCenterY, topCenterZ),
    parent: configurableAssembly,
    materials
  });

  addBoard({
    name: 'Opaska blatu — tylna',
    size: new THREE.Vector3(backBandWidth, TOP_BAND_HEIGHT, BOARD),
    position: new THREE.Vector3(topCenterX, bandCenterY, bandBackZ),
    parent: configurableAssembly,
    materials
  });
}

function buildConfigurableDesk(topWidth) {
  clearGroupGeometry(configurableAssembly);

  const topCenterX = 0;
  const topLeftEdgeX = -topWidth / 2;
  const topRightEdgeX = topWidth / 2;
  const helperOnLeft = selectedHelperSide === 'left';

  // Ten sam pomocnik działa jako wariant lewy lub lustrzany wariant prawy.
  helperGroup.scale.x = helperOnLeft ? 1 : -1;
  helperGroup.position.x = helperOnLeft
    ? topLeftEdgeX - xOuterLeft
    : topRightEdgeX - xOuterRight;

  const topMaterials = finishMaterialSets[selectedTopFinish];

  if (selectedCableGrommet) {
    const validPosition = findNearestValidCableGrommetPosition(
      cableGrommetPosition.x,
      cableGrommetPosition.z,
      topWidth
    );
    cableGrommetPosition.x = validPosition.x;
    cableGrommetPosition.z = validPosition.z;
    addTopBoardWithHole(topWidth, topMaterials);
  } else {
    addTopBoardWithoutHole(topWidth, topMaterials);
  }

  if (selectedTopBand) {
    addTopBand(topWidth, topCenterX, topCenterZ, topMaterials);
  }

  // Stelaż automatycznie przechodzi na stronę przeciwną do pomocnika.
  const frameX = helperOnLeft
    ? topRightEdgeX - FRAME_PROFILE / 2
    : topLeftEdgeX + FRAME_PROFILE / 2;

  const frontLegZ = TOP_DEPTH / 2 - FRAME_PROFILE / 2;
  const backLegZ = -TOP_DEPTH / 2 + FRAME_PROFILE / 2;
  const geometries = [
    createTranslatedBox(
      new THREE.Vector3(FRAME_PROFILE, HEIGHT, FRAME_PROFILE),
      new THREE.Vector3(frameX, HEIGHT / 2, frontLegZ)
    ),
    createTranslatedBox(
      new THREE.Vector3(FRAME_PROFILE, HEIGHT, FRAME_PROFILE),
      new THREE.Vector3(frameX, HEIGHT / 2, backLegZ)
    ),
    createTranslatedBox(
      new THREE.Vector3(
        FRAME_PROFILE,
        FRAME_PROFILE,
        TOP_DEPTH - FRAME_PROFILE * 2
      ),
      new THREE.Vector3(frameX, FRAME_PROFILE / 2, 0)
    )
  ];

  const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());

  if (!merged) {
    throw new Error('Nie udało się utworzyć geometrii stelaża.');
  }

  const frameMesh = new THREE.Mesh(merged, frameMaterials[selectedFrameFinish]);
  frameMesh.name = helperOnLeft
    ? 'Prawy stelaż metalowy'
    : 'Lewy stelaż metalowy';
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  configurableAssembly.add(frameMesh);

  const frameEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(merged, 20),
    frameEdgeMaterials[selectedFrameFinish]
  );
  frameEdges.name = `${frameMesh.name} — krawędzie`;
  configurableAssembly.add(frameEdges);

  if (selectedCableGrommet) {
    addCableGrommet();
  }
}

const BASE_PRICE = 2009.45;
const SIZE_SURCHARGES = {
  140: 0,
  160: 64.82,
  180: 127.55
};

const TOP_BAND_SURCHARGES = {
  140: 12.55,
  160: 18.82,
  180: 42.87
};

const CABLE_GROMMET_SURCHARGE = 58.89;

function formatPrice(value) {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function updatePriceInterface(topWidth = selectedTopWidth) {
  const priceElement = document.querySelector('#catalog-price');
  if (!priceElement) return;

  if (activeProduct === 'wardrobe') {
    const backSurcharge = selectedWardrobeBack === 'melamine'
      ? WARDROBE_BACK_SURCHARGE
      : 0;
    priceElement.textContent = `${formatPrice(
      WARDROBE_BASE_PRICE + backSurcharge
    )} zł brutto`;
    return;
  }

  const sizeSurcharge = SIZE_SURCHARGES[topWidth] ?? 0;
  const bandSurcharge = selectedTopBand ? (TOP_BAND_SURCHARGES[topWidth] ?? 0) : 0;
  const cableGrommetSurcharge = selectedCableGrommet ? CABLE_GROMMET_SURCHARGE : 0;

  priceElement.textContent = `${formatPrice(
    BASE_PRICE + sizeSurcharge + bandSurcharge + cableGrommetSurcharge
  )} zł brutto`;
}

function updateSizeInterface(topWidth) {
  document.querySelectorAll('.size-option').forEach((button) => {
    const isSelected = Number(button.dataset.width) === topWidth;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });

  updateTopBandSurchargeLabel(topWidth);
  updatePriceInterface(topWidth);
}

function updateHelperSideInterface(side) {
  document.querySelectorAll('.side-option[data-side]').forEach((button) => {
    const isSelected = button.dataset.side === side;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function updateTopBandInterface(enabled) {
  document.querySelectorAll('.band-option').forEach((button) => {
    const isSelected = (button.dataset.band === 'on') === enabled;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function updateTopBandSurchargeLabel(topWidth) {
  const surchargeElement = document.querySelector('#band-surcharge');
  if (!surchargeElement) return;

  const surcharge = TOP_BAND_SURCHARGES[topWidth] ?? 0;
  surchargeElement.textContent = `+ ${formatPrice(surcharge)} zł`;
}

function updateFrameFinishInterface(finish) {
  document.querySelectorAll('.frame-option').forEach((button) => {
    const isSelected = button.dataset.frameFinish === finish;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function updateCableGrommetInterface(enabled) {
  document.querySelectorAll('.cable-option').forEach((button) => {
    const isSelected = (button.dataset.cableGrommet === 'on') === enabled;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function applyHelperFinish() {
  const materials = finishMaterialSets[selectedHelperFinish];

  helperGroup.traverse((child) => {
    if (child.isMesh) {
      child.material = materials;
      child.material.needsUpdate = true;
    }
  });
}

function updateFinishInterface(target, finish) {
  document
    .querySelectorAll(`.finish-option[data-finish-target="${target}"]`)
    .forEach((button) => {
      const isSelected = button.dataset.finish === finish;
      button.classList.toggle('is-active', isSelected);
      button.setAttribute('aria-checked', String(isSelected));
    });
}

function selectFinish(target, finish) {
  if (!['white', 'beige', 'chocolate'].includes(finish)) return;

  if (target === 'top') {
    selectedTopFinish = finish;
    buildConfigurableDesk(selectedTopWidth);
    updateFinishInterface('top', selectedTopFinish);
  }

  if (target === 'helper') {
    selectedHelperFinish = finish;
    applyHelperFinish();
    updateFinishInterface('helper', selectedHelperFinish);
  }

  if (target === 'wardrobe') {
    selectedWardrobeFinish = finish;
    buildWardrobeModel();
    updateFinishInterface('wardrobe', selectedWardrobeFinish);
  }
}

function selectHelperSide(side) {
  if (!['left', 'right'].includes(side)) {
    updateHelperSideInterface(selectedHelperSide);
    return;
  }

  selectedHelperSide = side;
  buildConfigurableDesk(selectedTopWidth);
  applyHelperFinish();
  controls.target.x = 0;
  controls.update();
  updateHelperSideInterface(selectedHelperSide);
}

function selectTopBand(enabled) {
  selectedTopBand = Boolean(enabled);
  buildConfigurableDesk(selectedTopWidth);
  applyHelperFinish();
  controls.target.x = 0;
  controls.update();
  updateTopBandInterface(selectedTopBand);
  updatePriceInterface(selectedTopWidth);
}

function selectFrameFinish(finish) {
  if (!['black', 'white'].includes(finish)) return;
  selectedFrameFinish = finish;
  buildConfigurableDesk(selectedTopWidth);
  applyHelperFinish();
  updateFrameFinishInterface(selectedFrameFinish);
}

function selectCableGrommet(enabled) {
  selectedCableGrommet = Boolean(enabled);
  if (!selectedCableGrommet) {
    cableGrommetFlapOpen = false;
  }

  buildConfigurableDesk(selectedTopWidth);
  applyHelperFinish();
  controls.target.x = 0;
  controls.update();
  updateCableGrommetInterface(selectedCableGrommet);
  updatePriceInterface(selectedTopWidth);
}

function selectDeskWidth(topWidth) {
  if (![140, 160, 180].includes(topWidth)) {
    updateSizeInterface(selectedTopWidth);
    return;
  }

  selectedTopWidth = topWidth;
  buildConfigurableDesk(selectedTopWidth);
  controls.target.x = 0;
  controls.update();
  updateSizeInterface(selectedTopWidth);
}

buildConfigurableDesk(selectedTopWidth);
applyHelperFinish();
controls.target.x = 0;
controls.update();
updateSizeInterface(selectedTopWidth);
updateHelperSideInterface(selectedHelperSide);
updateTopBandInterface(selectedTopBand);
updateFrameFinishInterface(selectedFrameFinish);
updateCableGrommetInterface(selectedCableGrommet);
updateFinishInterface('top', selectedTopFinish);
updateFinishInterface('helper', selectedHelperFinish);

document.querySelectorAll('.size-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectDeskWidth(Number(button.dataset.width));
  });
});

document.querySelectorAll('.side-option[data-side]').forEach((button) => {
  button.addEventListener('click', () => {
    selectHelperSide(button.dataset.side);
  });
});

document.querySelectorAll('.band-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectTopBand(button.dataset.band === 'on');
  });
});

document.querySelectorAll('.finish-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectFinish(button.dataset.finishTarget, button.dataset.finish);
  });
});

document.querySelectorAll('.frame-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectFrameFinish(button.dataset.frameFinish);
  });
});

document.querySelectorAll('.cable-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectCableGrommet(button.dataset.cableGrommet === 'on');
  });
});

function updateWardrobeBackInterface(backType) {
  document.querySelectorAll('.wardrobe-back-option').forEach((button) => {
    const isSelected = button.dataset.wardrobeBack === backType;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function updateWardrobeHandleInterface(handleColor) {
  document.querySelectorAll('.wardrobe-handle-option').forEach((button) => {
    const isSelected = button.dataset.wardrobeHandle === handleColor;
    button.classList.toggle('is-active', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function selectWardrobeBack(backType) {
  if (!['hdf', 'melamine'].includes(backType)) return;
  selectedWardrobeBack = backType;
  rebuildWardrobeBack();
  updateWardrobeBackInterface(selectedWardrobeBack);
  updatePriceInterface();
}

function selectWardrobeHandle(handleColor) {
  if (!['gray', 'white', 'black'].includes(handleColor)) return;
  selectedWardrobeHandle = handleColor;
  applyWardrobeHandleFinish();
  updateWardrobeHandleInterface(selectedWardrobeHandle);
}

document.querySelectorAll('.wardrobe-back-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectWardrobeBack(button.dataset.wardrobeBack);
  });
});

document.querySelectorAll('.wardrobe-handle-option').forEach((button) => {
  button.addEventListener('click', () => {
    selectWardrobeHandle(button.dataset.wardrobeHandle);
  });
});

updateWardrobeBackInterface(selectedWardrobeBack);
updateWardrobeHandleInterface(selectedWardrobeHandle);
updateFinishInterface('wardrobe', selectedWardrobeFinish);

// ============================================================
// SZAFA — kliknięcie uchwytu otwiera i zamyka drzwi
// ============================================================
const wardrobeRaycaster = new THREE.Raycaster();
const wardrobePointer = new THREE.Vector2();
let wardrobeHandlePressed = false;
let wardrobeHandlePointerId = null;
let wardrobeHandlePressX = 0;
let wardrobeHandlePressY = 0;

function setWardrobePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  wardrobePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  wardrobePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getWardrobeHandleHit(event) {
  if (
    activeProduct !== 'wardrobe' ||
    !wardrobeHandleHitMesh ||
    !wardrobeModel.visible
  ) {
    return null;
  }

  setWardrobePointer(event);
  wardrobeRaycaster.setFromCamera(wardrobePointer, camera);
  return wardrobeRaycaster.intersectObject(wardrobeHandleHitMesh, false)[0] ?? null;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!getWardrobeHandleHit(event)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  wardrobeHandlePressed = true;
  wardrobeHandlePointerId = event.pointerId;
  wardrobeHandlePressX = event.clientX;
  wardrobeHandlePressY = event.clientY;
  controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.style.cursor = 'pointer';
}, true);

function finishWardrobeHandleInteraction(event) {
  if (!wardrobeHandlePressed || event.pointerId !== wardrobeHandlePointerId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const movement = Math.hypot(
    event.clientX - wardrobeHandlePressX,
    event.clientY - wardrobeHandlePressY
  );

  if (movement < 8) {
    wardrobeDoorOpen = !wardrobeDoorOpen;
  }

  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }

  wardrobeHandlePressed = false;
  wardrobeHandlePointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'default';
}

renderer.domElement.addEventListener('pointerup', finishWardrobeHandleInteraction, true);
renderer.domElement.addEventListener('pointercancel', finishWardrobeHandleInteraction, true);

// ============================================================
// PRZEPUST KABLOWY — przeciąganie i otwieranie klapki
// ============================================================
const cableRaycaster = new THREE.Raycaster();
const cablePointer = new THREE.Vector2();
const cableDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cablePlaneHit = new THREE.Vector3();

let cableDragging = false;
let cablePointerId = null;
let cableDragStartX = 0;
let cableDragStartY = 0;
let cableDragDistance = 0;
let cableLastRebuildTime = 0;

function setCablePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  cablePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  cablePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getCableHit(event) {
  if (activeProduct !== 'desk' || !selectedCableGrommet || !cableGrommetInteractiveMeshes.length) return null;
  setCablePointer(event);
  cableRaycaster.setFromCamera(cablePointer, camera);
  return cableRaycaster.intersectObjects(cableGrommetInteractiveMeshes, false)[0] ?? null;
}

function isPointerOverCableGrommet(event) {
  return Boolean(getCableHit(event));
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  const hit = getCableHit(event);
  if (!hit) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  cableDragging = true;
  cablePointerId = event.pointerId;
  cableDragStartX = event.clientX;
  cableDragStartY = event.clientY;
  cableDragDistance = 0;
  cableDragPlane.constant = -(HEIGHT + TOP_THICKNESS);

  controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.style.cursor = 'grabbing';
  updateCablePositionIndicator();
}, true);

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!cableDragging || event.pointerId !== cablePointerId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  cableDragDistance = Math.hypot(
    event.clientX - cableDragStartX,
    event.clientY - cableDragStartY
  );

  setCablePointer(event);
  cableRaycaster.setFromCamera(cablePointer, camera);
  if (!cableRaycaster.ray.intersectPlane(cableDragPlane, cablePlaneHit)) return;

  const valid = findNearestValidCableGrommetPosition(
    cablePlaneHit.x,
    cablePlaneHit.z,
    selectedTopWidth
  );

  cableGrommetPosition.x = valid.x;
  cableGrommetPosition.z = valid.z;
  updateCablePositionIndicator();

  // Otwór jest częścią geometrii blatu, więc podczas przesuwania
  // odbudowujemy blat wraz z wycięciem pod aktualną pozycją przepustu.
  const now = performance.now();
  if (now - cableLastRebuildTime > 28) {
    cableLastRebuildTime = now;
    buildConfigurableDesk(selectedTopWidth);
    applyHelperFinish();
  }
}, true);

function finishCableInteraction(event) {
  if (!cableDragging || event.pointerId !== cablePointerId) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (cableDragDistance < 6) {
    cableGrommetFlapOpen = !cableGrommetFlapOpen;
  } else {
    buildConfigurableDesk(selectedTopWidth);
    applyHelperFinish();
  }

  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }

  cableDragging = false;
  cablePointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'default';
  updateCablePositionIndicator();
}

renderer.domElement.addEventListener('pointerup', finishCableInteraction, true);
renderer.domElement.addEventListener('pointercancel', finishCableInteraction, true);

// ============================================================
// KOSTKA WIDOKU — polskie opisy, kliknięcie i obracanie przeciąganiem
// ============================================================
const gizmoScene = new THREE.Scene();
const gizmoCamera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 10);
gizmoCamera.position.set(0, 0, 5);
gizmoCamera.lookAt(0, 0, 0);

function makeFaceTexture(text, background, foreground = '#1d2733') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(30, 41, 59, 0.22)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  ctx.fillStyle = foreground;
  ctx.font = '700 40px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeFaceMaterial(text, background) {
  return new THREE.MeshBasicMaterial({
    map: makeFaceTexture(text, background)
  });
}

const gizmoCubeGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const gizmoCube = new THREE.Mesh(gizmoCubeGeometry, [
  makeFaceMaterial('PRAWO', '#f7fafc'),
  makeFaceMaterial('LEWO', '#f7fafc'),
  makeFaceMaterial('GÓRA', '#e7f0fb'),
  makeFaceMaterial('DÓŁ', '#f7fafc'),
  makeFaceMaterial('PRZÓD', '#eef7ec'),
  makeFaceMaterial('TYŁ', '#fff5eb')
]);
gizmoScene.add(gizmoCube);

const gizmoEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(gizmoCubeGeometry),
  new THREE.LineBasicMaterial({ color: 0x708090 })
);
gizmoScene.add(gizmoEdges);

gizmoScene.add(new THREE.HemisphereLight(0xffffff, 0xd0d7df, 1.6));

const gizmoRaycaster = new THREE.Raycaster();
const gizmoPointer = new THREE.Vector2();
const GIZMO_SIZE = 160;
const GIZMO_MARGIN = 16;
const GIZMO_DRAG_SPEED = 0.009;

// Kostka widoku działa wyłącznie w układzie komputerowym.
// Sprawdzamy szerokość przez tę samą granicę, której używa CSS mobilny.
const desktopGizmoMedia = window.matchMedia('(min-width: 761px)');

function isGizmoEnabled() {
  return desktopGizmoMedia.matches && activeProduct !== 'start';
}

let cameraTransition = null;
let gizmoDragging = false;
let gizmoPointerId = null;
let gizmoStartX = 0;
let gizmoStartY = 0;
let gizmoLastX = 0;
let gizmoLastY = 0;
let gizmoDragDistance = 0;

function startCameraTransition(position, up = new THREE.Vector3(0, 1, 0), duration = 420) {
  cameraTransition = {
    startTime: performance.now(),
    duration,
    startPosition: camera.position.clone(),
    endPosition: position.clone(),
    startUp: camera.up.clone(),
    endUp: up.clone()
  };
}

function setCameraView(direction, up = new THREE.Vector3(0, 1, 0)) {
  const target = controls.target.clone();
  const distance = camera.position.distanceTo(target);
  const endPosition = target
    .clone()
    .add(direction.clone().normalize().multiplyScalar(distance));

  startCameraTransition(endPosition, up);
}

function updateCameraTransition(now) {
  if (!cameraTransition) return;

  const t = Math.min(
    (now - cameraTransition.startTime) / cameraTransition.duration,
    1
  );
  const eased = 1 - Math.pow(1 - t, 3);

  camera.position.lerpVectors(
    cameraTransition.startPosition,
    cameraTransition.endPosition,
    eased
  );
  camera.up.lerpVectors(
    cameraTransition.startUp,
    cameraTransition.endUp,
    eased
  );
  camera.lookAt(controls.target);

  if (t >= 1) {
    cameraTransition = null;
  }
}

function getGizmoRect() {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    left: rect.width - GIZMO_SIZE - GIZMO_MARGIN,
    top: GIZMO_MARGIN,
    size: GIZMO_SIZE
  };
}

function isInsideGizmo(clientX, clientY) {
  if (!isGizmoEnabled()) return false;

  const canvasRect = renderer.domElement.getBoundingClientRect();
  const gizmoRect = getGizmoRect();
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;

  return (
    x >= gizmoRect.left &&
    x <= gizmoRect.left + gizmoRect.size &&
    y >= gizmoRect.top &&
    y <= gizmoRect.top + gizmoRect.size
  );
}

function rotateCameraFromGizmo(deltaX, deltaY) {
  cameraTransition = null;

  const target = controls.target;
  const offset = camera.position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= deltaX * GIZMO_DRAG_SPEED;
  spherical.phi -= deltaY * GIZMO_DRAG_SPEED;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.08, Math.PI - 0.08);

  offset.setFromSpherical(spherical);
  camera.position.copy(target).add(offset);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  controls.update();
}

function selectGizmoFace(clientX, clientY) {
  if (!isGizmoEnabled()) return;

  const canvasRect = renderer.domElement.getBoundingClientRect();
  const gizmoRect = getGizmoRect();
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;

  gizmoPointer.x = ((x - gizmoRect.left) / gizmoRect.size) * 2 - 1;
  gizmoPointer.y = -(((y - gizmoRect.top) / gizmoRect.size) * 2 - 1);

  gizmoRaycaster.setFromCamera(gizmoPointer, gizmoCamera);
  const hits = gizmoRaycaster.intersectObject(gizmoCube, false);
  if (!hits.length) return;

  switch (hits[0].face.materialIndex) {
    case 0:
      setCameraView(new THREE.Vector3(1, 0, 0));
      break;
    case 1:
      setCameraView(new THREE.Vector3(-1, 0, 0));
      break;
    case 2:
      setCameraView(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, -1)
      );
      break;
    case 3:
      setCameraView(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1)
      );
      break;
    case 4:
      setCameraView(new THREE.Vector3(0, 0, 1));
      break;
    case 5:
      setCameraView(new THREE.Vector3(0, 0, -1));
      break;
  }
}

renderer.domElement.addEventListener(
  'pointerdown',
  (event) => {
    if (!isGizmoEnabled() || !isInsideGizmo(event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopPropagation();

    gizmoDragging = true;
    gizmoPointerId = event.pointerId;
    gizmoStartX = event.clientX;
    gizmoStartY = event.clientY;
    gizmoLastX = event.clientX;
    gizmoLastY = event.clientY;
    gizmoDragDistance = 0;

    controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  },
  true
);

renderer.domElement.addEventListener(
  'pointermove',
  (event) => {
    if (gizmoDragging && event.pointerId === gizmoPointerId) {
      event.preventDefault();
      event.stopPropagation();

      const deltaX = event.clientX - gizmoLastX;
      const deltaY = event.clientY - gizmoLastY;
      gizmoDragDistance += Math.hypot(deltaX, deltaY);

      rotateCameraFromGizmo(deltaX, deltaY);

      gizmoLastX = event.clientX;
      gizmoLastY = event.clientY;
      return;
    }

    renderer.domElement.style.cursor =
      isInsideGizmo(event.clientX, event.clientY) || isPointerOverCableGrommet(event)
        ? 'grab'
        : 'default';
  },
  true
);

function finishGizmoInteraction(event) {
  if (!gizmoDragging || event.pointerId !== gizmoPointerId) return;

  event.preventDefault();
  event.stopPropagation();

  if (gizmoDragDistance < 6) {
    selectGizmoFace(event.clientX, event.clientY);
  }

  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }

  gizmoDragging = false;
  gizmoPointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = isInsideGizmo(event.clientX, event.clientY)
    ? 'grab'
    : 'default';
}

renderer.domElement.addEventListener('pointerup', finishGizmoInteraction, true);
renderer.domElement.addEventListener('pointercancel', finishGizmoInteraction, true);

// ============================================================
// PODŁOGA — drewniany parkiet z delikatną grubością
// ============================================================
const FLOOR_WIDTH = 250;
const FLOOR_DEPTH = 180;
const FLOOR_THICKNESS = 2.0;

const floorTexture = textureLoader.load('./floor-texture.jpg');
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(2.0, 1.45);
floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const floorBumpTexture = floorTexture.clone();
floorBumpTexture.needsUpdate = true;
floorBumpTexture.colorSpace = THREE.NoColorSpace;

const floorTopMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: floorTexture,
  bumpMap: floorBumpTexture,
  bumpScale: 0.13,
  roughness: 0.72,
  metalness: 0.0
});

const floorSideMaterial = new THREE.MeshStandardMaterial({
  color: 0x7b5734,
  roughness: 0.86,
  metalness: 0.0
});

// Materiały BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
// Tekstura parkietu znajduje się na górnej powierzchni,
// a widoczne krawędzie mają spokojny drewniany kolor.
const floorMaterials = [
  floorSideMaterial,
  floorSideMaterial,
  floorTopMaterial,
  floorSideMaterial,
  floorSideMaterial,
  floorSideMaterial
];

const floorGeometry = new THREE.BoxGeometry(
  FLOOR_WIDTH,
  FLOOR_THICKNESS,
  FLOOR_DEPTH
);

const floor = new THREE.Mesh(floorGeometry, floorMaterials);
floor.position.set(0, -FLOOR_THICKNESS / 2, 0);
floor.castShadow = true;
floor.receiveShadow = true;
scene.add(floor);

const floorEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(floorGeometry, 20),
  new THREE.LineBasicMaterial({
    color: 0x5f452c,
    transparent: true,
    opacity: 0.22
  })
);
floorEdges.position.copy(floor.position);
scene.add(floorEdges);


// ============================================================
// OFERTA PDF - rzuty, konfiguracja i wycena
// ============================================================
const FINISH_LABELS = {
  white: 'White',
  beige: 'Beige',
  chocolate: 'Chocolate'
};

const FRAME_FINISH_LABELS = {
  black: 'Czarny',
  white: 'Biały'
};

const WARDROBE_HANDLE_LABELS = {
  gray: 'Szary',
  white: 'Biały',
  black: 'Czarny'
};

const PDF_PAGE_WIDTH = 1684;
const PDF_PAGE_HEIGHT = 1190;
const PDF_GREEN = '#2f8f5b';
const PDF_DARK = '#1c2025';
const PDF_MUTED = '#6f767f';
const PDF_LINE = '#e2e6e9';
const PDF_SOFT = '#f4f7f5';

// PDF jest składany lokalnie bez zewnętrznych bibliotek.
// Dzięki temu generowanie działa także offline oraz w Safari/iOS,
// gdzie dynamiczne ładowanie jsPDF z CDN potrafiło się nie udać.
const PDF_PAGE_WIDTH_PT = 841.89;
const PDF_PAGE_HEIGHT_PT = 595.28;

function encodePdfAscii(value) {
  return new TextEncoder().encode(value);
}

function concatenateByteArrays(chunks, totalLength) {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function canvasToJpegPage(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    // toDataURL jest najbardziej przewidywalne w Safari i nie korzysta z
    // Blob.arrayBuffer(), którego starsze wersje Safari nie obsługują stabilnie.
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (!dataUrl || !dataUrl.startsWith('data:image/jpeg')) {
        throw new Error('Nie udało się zakodować strony jako JPEG.');
      }

      resolve({
        bytes: dataUrlToBytes(dataUrl),
        width: canvas.width,
        height: canvas.height
      });
    } catch (dataUrlError) {
      // Awaryjny wariant dla przeglądarek, które lepiej radzą sobie z toBlob.
      if (typeof canvas.toBlob !== 'function') {
        reject(dataUrlError);
        return;
      }

      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(dataUrlError);
              return;
            }

            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? dataUrlError);
            reader.onload = () => {
              try {
                resolve({
                  bytes: new Uint8Array(reader.result),
                  width: canvas.width,
                  height: canvas.height
                });
              } catch (readerError) {
                reject(readerError);
              }
            };
            reader.readAsArrayBuffer(blob);
          },
          'image/jpeg',
          quality
        );
      } catch (blobError) {
        reject(blobError);
      }
    }
  });
}

function buildImagePdf(pages) {
  if (!pages.length) {
    throw new Error('Brak stron do zapisania w PDF.');
  }

  const pageObjectNumbers = pages.map((_, index) => 3 + index * 3);
  const lastObjectNumber = 2 + pages.length * 3;
  const offsets = new Array(lastObjectNumber + 1).fill(0);
  const chunks = [];
  let totalLength = 0;

  const append = (chunk) => {
    const bytes = typeof chunk === 'string' ? encodePdfAscii(chunk) : chunk;
    chunks.push(bytes);
    totalLength += bytes.length;
  };

  const addObject = (objectNumber, bodyParts) => {
    offsets[objectNumber] = totalLength;
    append(`${objectNumber} 0 obj\n`);
    bodyParts.forEach(append);
    append('\nendobj\n');
  };

  append(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
      0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a
    ])
  );

  addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  addObject(2, [
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((number) => `${number} 0 R`)
      .join(' ')}] /Count ${pages.length} >>`
  ]);

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    const imageName = `Im${index + 1}`;

    addObject(pageObject, [
      `<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${PDF_PAGE_WIDTH_PT} ${PDF_PAGE_HEIGHT_PT}] ` +
        `/Resources << /XObject << /${imageName} ${imageObject} 0 R >> >> ` +
        `/Contents ${contentObject} 0 R >>`
    ]);

    addObject(imageObject, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} ` +
        `/Height ${page.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      '\nendstream'
    ]);

    const content = encodePdfAscii(
      `q\n${PDF_PAGE_WIDTH_PT} 0 0 ${PDF_PAGE_HEIGHT_PT} 0 0 cm\n` +
        `/${imageName} Do\nQ\n`
    );

    addObject(contentObject, [
      `<< /Length ${content.length} >>\nstream\n`,
      content,
      'endstream'
    ]);
  });

  const xrefOffset = totalLength;
  append(`xref\n0 ${lastObjectNumber + 1}\n`);
  append('0000000000 65535 f \n');

  for (let objectNumber = 1; objectNumber <= lastObjectNumber; objectNumber += 1) {
    append(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`);
  }

  append(
    `trailer\n<< /Size ${lastObjectNumber + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(
    [concatenateByteArrays(chunks, totalLength)],
    { type: 'application/pdf' }
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isSafariBrowser() {
  const userAgent = navigator.userAgent;
  const hasSafari = /Safari/i.test(userAgent);
  const isOtherWebKitBrowser = /Chrome|CriOS|Chromium|Edg|OPR|FxiOS/i.test(
    userAgent
  );
  return hasSafari && !isOtherWebKitBrowser;
}

function createPrintPreviewWindow() {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) return null;

  previewWindow.document.open();
  previewWindow.document.write(
    '<!doctype html><html lang="pl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Generowanie oferty PDF</title></head>' +
      '<body style="margin:0;display:grid;place-items:center;min-height:100vh;' +
      'font:16px system-ui;color:#1c2025;background:#f4f5f4">' +
      '<p>Generowanie oferty PDF...</p></body></html>'
  );
  previewWindow.document.close();
  return previewWindow;
}

function openPrintableOffer(pageCanvases, filename, previewWindow = null) {
  const targetWindow = previewWindow && !previewWindow.closed
    ? previewWindow
    : window.open('', '_blank');

  if (!targetWindow) {
    throw new Error(
      'Przeglądarka zablokowała okno wydruku. Zezwól na wyskakujące okna.'
    );
  }

  const pageImages = pageCanvases.map((canvas) =>
    canvas.toDataURL('image/jpeg', 0.9)
  );

  targetWindow.document.open();
  targetWindow.document.write(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${filename.replace(/\.pdf$/i, '')}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page {
      width: 297mm;
      height: 210mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      background: #fff;
    }
    .page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .page img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    @media screen {
      body { background: #dfe3e1; padding: 18px; }
      .page {
        margin: 0 auto 18px;
        box-shadow: 0 10px 35px rgba(0,0,0,.16);
      }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .page { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  ${pageImages
    .map((source, index) =>
      `<section class="page"><img src="${source}" alt="Strona ${index + 1}"></section>`
    )
    .join('')}
  <script>
    (() => {
      const images = Array.from(document.images);
      const ready = Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));
      ready.then(() => {
        window.focus();
        setTimeout(() => window.print(), 350);
      });
    })();
  <\/script>
</body>
</html>`);
  targetWindow.document.close();
}

function saveGeneratedPdf(pdfBlob, filename, iosPreviewWindow = null) {
  const objectUrl = URL.createObjectURL(pdfBlob);

  if (iosPreviewWindow && !iosPreviewWindow.closed) {
    iosPreviewWindow.location.replace(objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
    return;
  }

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

function getCurrentPriceBreakdown() {
  if (activeProduct === 'wardrobe') {
    const backSurcharge = selectedWardrobeBack === 'melamine'
      ? WARDROBE_BACK_SURCHARGE
      : 0;
    const items = [
      {
        label: 'Cena bazowa szafy',
        value: WARDROBE_BASE_PRICE,
        kind: 'base'
      }
    ];

    if (backSurcharge > 0) {
      items.push({
        label: 'Plecy - płyta melaminowana 18 mm',
        value: backSurcharge,
        kind: 'surcharge'
      });
    }

    return {
      items,
      total: WARDROBE_BASE_PRICE + backSurcharge
    };
  }

  const sizeSurcharge = SIZE_SURCHARGES[selectedTopWidth] ?? 0;
  const bandSurcharge = selectedTopBand
    ? (TOP_BAND_SURCHARGES[selectedTopWidth] ?? 0)
    : 0;
  const cableGrommetSurcharge = selectedCableGrommet ? CABLE_GROMMET_SURCHARGE : 0;
  const total = BASE_PRICE + sizeSurcharge + bandSurcharge + cableGrommetSurcharge;

  const items = [
    {
      label: 'Cena bazowa',
      value: BASE_PRICE,
      kind: 'base'
    }
  ];

  if (sizeSurcharge > 0) {
    items.push({
      label: `Dopłata za wymiar ${selectedTopWidth} × 80 × 74 cm`,
      value: sizeSurcharge,
      kind: 'surcharge'
    });
  }

  if (selectedTopBand) {
    items.push({
      label: 'Opaska blatu',
      value: bandSurcharge,
      kind: 'surcharge'
    });
  }

  if (selectedCableGrommet) {
    items.push({
      label: 'Przepust kablowy',
      value: cableGrommetSurcharge,
      kind: 'surcharge'
    });
  }

  return { items, total };
}

function getConfigurationRows() {
  if (activeProduct === 'wardrobe') {
    return [
      ['Rozmiar', '40 × 40 × 189 cm'],
      ['Kolor szafy', FINISH_LABELS[selectedWardrobeFinish] ?? selectedWardrobeFinish],
      [
        'Plecy',
        selectedWardrobeBack === 'melamine'
          ? 'Płyta melaminowana 18 mm'
          : 'Płyta HDF 3 mm'
      ],
      ['Kolor uchwytu', WARDROBE_HANDLE_LABELS[selectedWardrobeHandle] ?? selectedWardrobeHandle],
      ['Zawiasy', 'Puszkowe 35 mm, nakładane, 100°'],
      ['Półki wewnętrzne', '4 szt.'],
      ['Płyty korpusu i frontu', 'Płyta melaminowana 18 mm']
    ];
  }

  return [
    ['Rozmiar', `${selectedTopWidth} × 80 × 74 cm`],
    ['Pomocnik - strona', selectedHelperSide === 'left' ? 'Lewa' : 'Prawa'],
    ['Kolor blatu', FINISH_LABELS[selectedTopFinish] ?? selectedTopFinish],
    ['Kolor pomocnika', FINISH_LABELS[selectedHelperFinish] ?? selectedHelperFinish],
    ['Opaska blatu', selectedTopBand ? 'Tak, wysokość 10 cm' : 'Nie'],
    ['Stelaż', FRAME_FINISH_LABELS[selectedFrameFinish] ?? selectedFrameFinish],
    ['Przepust kablowy', selectedCableGrommet ? 'Tak, 16 × 6,8 cm' : 'Nie'],
    ['Materiał płyt', 'Płyta melaminowana 18 mm'],
    ['Materiał stelaża', 'Profile metalowe spawane, malowane proszkowo']
  ];
}

function createPdfCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = PDF_PAGE_WIDTH;
  canvas.height = PDF_PAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height
  );
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawPdfHeader(ctx, title, subtitle = '') {
  ctx.fillStyle = PDF_GREEN;
  ctx.fillRect(0, 0, PDF_PAGE_WIDTH, 92);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 38px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 62, 46);

  if (subtitle) {
    ctx.font = '500 18px Inter, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(subtitle, PDF_PAGE_WIDTH - 62, 46);
    ctx.textAlign = 'left';
  }
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);

  lines.slice(0, maxLines).forEach((value, index) => {
    ctx.fillText(value, x, y + index * lineHeight);
  });

  return Math.min(lines.length, maxLines) * lineHeight;
}

function drawImageContain(ctx, sourceCanvas, x, y, width, height, padding = 0) {
  const sourceRatio = sourceCanvas.width / sourceCanvas.height;
  const targetRatio = width / height;
  let drawWidth;
  let drawHeight;

  if (sourceRatio > targetRatio) {
    drawWidth = width - padding * 2;
    drawHeight = drawWidth / sourceRatio;
  } else {
    drawHeight = height - padding * 2;
    drawWidth = drawHeight * sourceRatio;
  }

  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
}

function getModelBoundsForPdf() {
  const activeModel = activeProduct === 'wardrobe' ? wardrobeModel : model;
  activeModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(activeModel);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { box, center, size };
}

function getBoxCorners(box) {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
}

function captureModelView({
  direction,
  up = new THREE.Vector3(0, 1, 0),
  width = 1000,
  height = 620,
  margin = 1.18
}) {
  const { box, center, size } = getModelBoundsForPdf();
  const cameraDirection = direction.clone().normalize();
  const viewForward = cameraDirection.clone().multiplyScalar(-1);
  const viewRight = new THREE.Vector3()
    .crossVectors(viewForward, up)
    .normalize();
  const viewUp = new THREE.Vector3()
    .crossVectors(viewRight, viewForward)
    .normalize();

  let minRight = Infinity;
  let maxRight = -Infinity;
  let minUp = Infinity;
  let maxUp = -Infinity;

  getBoxCorners(box).forEach((corner) => {
    const relative = corner.clone().sub(center);
    const projectedRight = relative.dot(viewRight);
    const projectedUp = relative.dot(viewUp);
    minRight = Math.min(minRight, projectedRight);
    maxRight = Math.max(maxRight, projectedRight);
    minUp = Math.min(minUp, projectedUp);
    maxUp = Math.max(maxUp, projectedUp);
  });

  const aspect = width / height;
  const projectedWidth = Math.max(1, maxRight - minRight);
  const projectedHeight = Math.max(1, maxUp - minUp);
  const frustumHeight = Math.max(projectedHeight, projectedWidth / aspect) * margin;
  const frustumWidth = frustumHeight * aspect;

  const captureCamera = new THREE.OrthographicCamera(
    -frustumWidth / 2,
    frustumWidth / 2,
    frustumHeight / 2,
    -frustumHeight / 2,
    0.1,
    Math.max(size.length() * 12, 2000)
  );

  const distance = Math.max(size.length() * 4, 400);
  captureCamera.position.copy(center).add(cameraDirection.multiplyScalar(distance));
  captureCamera.up.copy(viewUp);
  captureCamera.lookAt(center);
  captureCamera.updateProjectionMatrix();
  captureCamera.updateMatrixWorld(true);

  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false
  });
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace;

  const previousTarget = renderer.getRenderTarget();
  const previousBackground = scene.background;
  const previousClearColor = renderer.getClearColor(new THREE.Color());
  const previousClearAlpha = renderer.getClearAlpha();
  const previousFloorVisible = floor.visible;
  const previousFloorEdgesVisible = floorEdges.visible;
  const previousFlapOpen = cableGrommetFlapOpen;
  const previousFlapRotation = cableGrommetFlapPivot
    ? cableGrommetFlapPivot.rotation.x
    : 0;

  scene.background = new THREE.Color(0xf8f9f8);
  floor.visible = false;
  floorEdges.visible = false;
  cableGrommetFlapOpen = false;
  if (cableGrommetFlapPivot) cableGrommetFlapPivot.rotation.x = 0;

  renderer.setRenderTarget(renderTarget);
  renderer.setViewport(0, 0, width, height);
  renderer.setScissorTest(false);
  renderer.setClearColor(0xf8f9f8, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, captureCamera);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = width;
  captureCanvas.height = height;
  const captureContext = captureCanvas.getContext('2d');
  const imageData = captureContext.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - y - 1;
    const sourceOffset = sourceRow * width * 4;
    const targetOffset = y * width * 4;
    imageData.data.set(
      pixels.subarray(sourceOffset, sourceOffset + width * 4),
      targetOffset
    );
  }

  captureContext.putImageData(imageData, 0, 0);

  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousClearColor, previousClearAlpha);
  scene.background = previousBackground;
  floor.visible = previousFloorVisible;
  floorEdges.visible = previousFloorEdgesVisible;
  cableGrommetFlapOpen = previousFlapOpen;
  if (cableGrommetFlapPivot) {
    cableGrommetFlapPivot.rotation.x = previousFlapRotation;
  }
  renderTarget.dispose();

  return captureCanvas;
}

function createOfferCoverPage(views, generatedAt) {
  const { canvas, ctx } = createPdfCanvas();
  drawPdfHeader(ctx, 'Oferta konfiguracji biurka', generatedAt);

  drawRoundedRect(ctx, 58, 130, 505, 930, 24, PDF_SOFT, PDF_LINE);
  ctx.fillStyle = PDF_DARK;
  ctx.font = '700 29px Inter, Arial, sans-serif';
  ctx.fillText('Wybrana konfiguracja', 92, 184);

  const rows = getConfigurationRows();
  let rowY = 232;
  rows.forEach(([label, value]) => {
    ctx.fillStyle = PDF_MUTED;
    ctx.font = '600 17px Inter, Arial, sans-serif';
    ctx.fillText(label, 92, rowY);

    ctx.fillStyle = PDF_DARK;
    ctx.font = '700 19px Inter, Arial, sans-serif';
    const heightUsed = drawWrappedText(ctx, value, 92, rowY + 28, 425, 24, 2);
    rowY += Math.max(64, heightUsed + 42);
  });

  const breakdown = getCurrentPriceBreakdown();
  drawRoundedRect(ctx, 86, 875, 448, 145, 18, '#ffffff', '#d9e5dd');
  ctx.fillStyle = PDF_MUTED;
  ctx.font = '700 16px Inter, Arial, sans-serif';
  ctx.fillText('CENA KATALOGOWA', 112, 920);
  ctx.fillStyle = PDF_GREEN;
  ctx.font = '800 36px Inter, Arial, sans-serif';
  ctx.fillText(`${formatPrice(breakdown.total)} zł brutto`, 112, 970);

  drawRoundedRect(ctx, 600, 130, 1026, 720, 24, '#f8f9f8', PDF_LINE);
  drawImageContain(ctx, views.iso, 620, 150, 986, 680, 18);

  drawRoundedRect(ctx, 600, 882, 1026, 178, 22, '#ffffff', PDF_LINE);
  ctx.fillStyle = PDF_DARK;
  ctx.font = '700 24px Inter, Arial, sans-serif';
  ctx.fillText('Najważniejsze wymiary', 638, 930);

  const dimensionItems = [
    [`${selectedTopWidth} cm`, 'szerokość'],
    ['80 cm', 'głębokość'],
    ['74 cm', 'wysokość'],
    ['18 mm', 'grubość płyt']
  ];

  dimensionItems.forEach(([value, label], index) => {
    const x = 638 + index * 235;
    ctx.fillStyle = PDF_GREEN;
    ctx.font = '800 28px Inter, Arial, sans-serif';
    ctx.fillText(value, x, 982);
    ctx.fillStyle = PDF_MUTED;
    ctx.font = '600 15px Inter, Arial, sans-serif';
    ctx.fillText(label, x, 1013);
  });

  return canvas;
}

function createOfferViewsPage(views) {
  const { canvas, ctx } = createPdfCanvas();
  drawPdfHeader(ctx, activeProduct === 'wardrobe' ? 'Rzuty szafy' : 'Rzuty biurka', 'Widoki bez perspektywy');

  const cards = [
    ['Przód', views.front],
    ['Tył', views.back],
    ['Lewa strona', views.left],
    ['Prawa strona', views.right],
    ['Góra', views.top],
    ['Spód', views.bottom]
  ];

  const startX = 54;
  const startY = 126;
  const gapX = 26;
  const gapY = 26;
  const cardWidth = 508;
  const cardHeight = 485;

  cards.forEach(([label, view], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = startX + column * (cardWidth + gapX);
    const y = startY + row * (cardHeight + gapY);

    drawRoundedRect(ctx, x, y, cardWidth, cardHeight, 20, '#fafbfa', PDF_LINE);
    ctx.fillStyle = PDF_DARK;
    ctx.font = '700 23px Inter, Arial, sans-serif';
    ctx.fillText(label, x + 24, y + 38);
    drawImageContain(ctx, view, x + 14, y + 52, cardWidth - 28, cardHeight - 70, 8);
  });

  return canvas;
}

function createOfferPricingPage(views, generatedAt) {
  const { canvas, ctx } = createPdfCanvas();
  drawPdfHeader(ctx, 'Konfiguracja i wycena', generatedAt);

  drawRoundedRect(ctx, 56, 128, 720, 950, 24, '#ffffff', PDF_LINE);
  ctx.fillStyle = PDF_DARK;
  ctx.font = '700 29px Inter, Arial, sans-serif';
  ctx.fillText('Opis konfiguracji', 92, 182);

  let rowY = 230;
  getConfigurationRows().forEach(([label, value], index) => {
    if (index > 0) {
      ctx.strokeStyle = PDF_LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(92, rowY - 18);
      ctx.lineTo(740, rowY - 18);
      ctx.stroke();
    }

    ctx.fillStyle = PDF_MUTED;
    ctx.font = '600 17px Inter, Arial, sans-serif';
    ctx.fillText(label, 92, rowY);
    ctx.fillStyle = PDF_DARK;
    ctx.font = '700 18px Inter, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, 740, rowY);
    ctx.textAlign = 'left';
    rowY += 67;
  });

  drawRoundedRect(ctx, 814, 128, 814, 430, 24, '#fafbfa', PDF_LINE);
  drawImageContain(ctx, views.iso, 834, 148, 774, 390, 10);

  drawRoundedRect(ctx, 814, 590, 814, 488, 24, PDF_SOFT, '#d9e5dd');
  ctx.fillStyle = PDF_DARK;
  ctx.font = '700 29px Inter, Arial, sans-serif';
  ctx.fillText('Wycena', 852, 646);

  const breakdown = getCurrentPriceBreakdown();
  let priceY = 705;
  breakdown.items.forEach((item, index) => {
    if (index > 0) {
      ctx.strokeStyle = '#d9e0dc';
      ctx.beginPath();
      ctx.moveTo(852, priceY - 25);
      ctx.lineTo(1590, priceY - 25);
      ctx.stroke();
    }

    ctx.fillStyle = item.kind === 'surcharge' ? PDF_GREEN : PDF_DARK;
    ctx.font = '600 19px Inter, Arial, sans-serif';
    drawWrappedText(ctx, item.label, 852, priceY, 510, 25, 2);

    ctx.textAlign = 'right';
    ctx.font = '700 20px Inter, Arial, sans-serif';
    const prefix = item.kind === 'surcharge' ? '+ ' : '';
    ctx.fillText(`${prefix}${formatPrice(item.value)} zł`, 1588, priceY);
    ctx.textAlign = 'left';
    priceY += 76;
  });

  ctx.strokeStyle = '#bad4c4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(852, 930);
  ctx.lineTo(1590, 930);
  ctx.stroke();

  ctx.fillStyle = PDF_DARK;
  ctx.font = '700 21px Inter, Arial, sans-serif';
  ctx.fillText('Razem brutto', 852, 982);
  ctx.fillStyle = PDF_GREEN;
  ctx.font = '800 35px Inter, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${formatPrice(breakdown.total)} zł`, 1588, 982);
  ctx.textAlign = 'left';

  ctx.fillStyle = PDF_MUTED;
  ctx.font = '500 14px Inter, Arial, sans-serif';
  drawWrappedText(
    ctx,
    'Pozycje bez wskazanej dopłaty są ujęte w cenie bazowej. Dokument przedstawia konfigurację aktywną w chwili wygenerowania oferty.',
    852,
    1030,
    700,
    20,
    3
  );

  return canvas;
}

function getOfferFilename() {
  const datePart = new Date().toISOString().slice(0, 10);
  return activeProduct === 'wardrobe'
    ? `oferta-szafa-40x40x189-${datePart}.pdf`
    : `oferta-biurko-${selectedTopWidth}x80x74-${datePart}.pdf`;
}

function setPdfButtonLoading(loading) {
  const button = document.querySelector('#generate-offer-pdf');
  if (!button) return;

  button.classList.toggle('is-loading', loading);
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
  button.title = loading ? 'Generowanie PDF...' : 'Generuj ofertę PDF';
}

async function generateOfferPdf() {
  setPdfButtonLoading(true);

  // Safari ma ograniczenia przy pobieraniu dynamicznie tworzonych Blobów PDF.
  // Okno jest otwierane bezpośrednio podczas kliknięcia, żeby nie zostało
  // zablokowane jako popup. W Safari używamy natywnego zapisu przez drukowanie.
  const useNativePrint = isSafariBrowser();
  const previewWindow = useNativePrint ? createPrintPreviewWindow() : null;
  let pageCanvases = [];
  let views = null;

  try {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const captureSettings = { width: 900, height: 565 };
    views = {
      iso: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(1.1, 0.8, 1.15),
        margin: 1.14
      }),
      front: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(0, 0, 1)
      }),
      back: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(0, 0, -1)
      }),
      left: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(-1, 0, 0)
      }),
      right: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(1, 0, 0)
      }),
      top: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(0, 1, 0),
        up: new THREE.Vector3(0, 0, -1)
      }),
      bottom: captureModelView({
        ...captureSettings,
        direction: new THREE.Vector3(0, -1, 0),
        up: new THREE.Vector3(0, 0, 1)
      })
    };

    const generatedAt = new Date().toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Oferta ma teraz dwie strony:
    // 1. konfiguracja i wycena (wcześniej ostatnia strona),
    // 2. rzuty produktu.
    pageCanvases = [
      createOfferPricingPage(views, generatedAt),
      createOfferViewsPage(views)
    ];

    const filename = getOfferFilename();

    if (useNativePrint) {
      openPrintableOffer(pageCanvases, filename, previewWindow);
      return;
    }

    const pdfPages = [];
    for (const pageCanvas of pageCanvases) {
      pdfPages.push(await canvasToJpegPage(pageCanvas, 0.88));
    }

    const pdfBlob = buildImagePdf(pdfPages);
    saveGeneratedPdf(pdfBlob, filename);
  } catch (error) {
    console.error('Nie udało się wygenerować PDF:', error);

    // Gdy automatyczny zapis nie powiedzie się, spróbuj jeszcze natywnego
    // okna wydruku zamiast kończyć działanie samym komunikatem błędu.
    if (pageCanvases.length) {
      try {
        const filename = getOfferFilename();
        openPrintableOffer(pageCanvases, filename, previewWindow);
        return;
      } catch (printError) {
        console.error('Nie udało się otworzyć wersji do wydruku:', printError);
      }
    }

    if (previewWindow && !previewWindow.closed) {
      previewWindow.close();
    }

    const details = error && (error.message || String(error));
    window.alert(
      'Nie udało się wygenerować oferty PDF.' +
        (details ? `\n\nSzczegóły: ${details}` : '')
    );
  } finally {
    // Bufory zwalniamy dopiero po utworzeniu dokumentu/strony wydruku.
    pageCanvases.forEach((pageCanvas) => {
      pageCanvas.width = 1;
      pageCanvas.height = 1;
    });

    if (views) {
      Object.values(views).forEach((viewCanvas) => {
        viewCanvas.width = 1;
        viewCanvas.height = 1;
      });
    }

    setPdfButtonLoading(false);
  }
}

document
  .querySelector('#generate-offer-pdf')
  ?.addEventListener('click', generateOfferPdf);


// ============================================================
// PORTFOLIO PRODUKTÓW / PROSTE ROUTING HASH
// ============================================================
const productStart = document.querySelector('#product-start');
const productBackButton = document.querySelector('#product-back-button');
const productRouteButtons = document.querySelectorAll('[data-product-route]');

function getProductFromHash() {
  const hash = window.location.hash.toLowerCase();
  if (hash === '#biurko') return 'desk';
  if (hash === '#szafa') return 'wardrobe';
  return 'start';
}

function frameProductInCamera(product) {
  camera.up.set(0, 1, 0);
  cameraTransition = null;

  if (product === 'wardrobe') {
    controls.target.set(0, WARDROBE_HEIGHT / 2, 0);
    controls.minDistance = 155;
    controls.maxDistance = 500;

    const wardrobeDirection = new THREE.Vector3(0.34, 0.16, 1).normalize();
    camera.position
      .copy(controls.target)
      .add(wardrobeDirection.multiplyScalar(330));
  } else {
    controls.target.set(0, HEIGHT * 0.55, 0);
    controls.minDistance = 100;
    controls.maxDistance = 360;

    camera.position
      .copy(controls.target)
      .add(new THREE.Vector3(0.30, 0.25, 1).normalize().multiplyScalar(360));
  }

  camera.lookAt(controls.target);
  controls.update();
}

function setProductRoute(product) {
  const nextProduct = ['desk', 'wardrobe'].includes(product) ? product : 'start';
  const previousProduct = activeProduct;
  activeProduct = nextProduct;

  document.body.classList.remove('route-start', 'route-desk', 'route-wardrobe');
  document.body.classList.add(`route-${nextProduct}`);

  // Każdy produkt zachowujemy w pamięci i przełączamy wyłącznie widoczność grup.
  model.visible = nextProduct === 'desk';
  wardrobeModel.visible = nextProduct === 'wardrobe';
  cablePositionIndicator.classList.remove('is-visible');

  if (nextProduct !== 'start' && nextProduct !== previousProduct) {
    frameProductInCamera(nextProduct);
  }

  document.title =
    nextProduct === 'desk'
      ? 'Biurko 3D'
      : nextProduct === 'wardrobe'
        ? 'Szafa 3D'
        : 'Konfigurator produktów';

  productStart?.setAttribute('aria-hidden', String(nextProduct !== 'start'));
  productBackButton?.setAttribute('aria-hidden', String(nextProduct === 'start'));

  if (nextProduct !== 'start') {
    updatePriceInterface(selectedTopWidth);
  }

  // Po zmianie produktu wracamy do początku dokumentu i dopasowujemy renderer
  // do aktualnego układu mobilnego lub komputerowego.
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  requestAnimationFrame(() => {
    onResize();
    requestAnimationFrame(onResize);
  });
}

function navigateToProduct(product) {
  const targetHash = product === 'desk' ? '#biurko' : product === 'wardrobe' ? '#szafa' : '';

  if (targetHash) {
    if (window.location.hash === targetHash) {
      setProductRoute(product);
    } else {
      window.location.hash = targetHash;
    }
    return;
  }

  if (window.location.hash) {
    window.location.hash = '';
  } else {
    setProductRoute('start');
  }
}

productRouteButtons.forEach((button) => {
  button.addEventListener('click', () => {
    navigateToProduct(button.dataset.productRoute);
  });
});

productBackButton?.addEventListener('click', () => navigateToProduct('start'));
window.addEventListener('hashchange', () => setProductRoute(getProductFromHash()));

// ============================================================
// RENDEROWANIE
// ============================================================
let viewportSize = initialViewport;

function onResize() {
  viewportSize = getAppViewportSize();
  camera.aspect = viewportSize.width / viewportSize.height;
  camera.updateProjectionMatrix();
  renderer.setSize(viewportSize.width, viewportSize.height);
}

window.addEventListener('resize', onResize);

desktopGizmoMedia.addEventListener?.('change', (event) => {
  if (event.matches || !gizmoDragging) return;

  gizmoDragging = false;
  gizmoPointerId = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'default';
});

if ('ResizeObserver' in window) {
  const appResizeObserver = new ResizeObserver(onResize);
  appResizeObserver.observe(app);
}

function renderMainScene() {
  renderer.setViewport(0, 0, viewportSize.width, viewportSize.height);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.render(scene, camera);
}

function renderGizmo() {
  if (!isGizmoEnabled()) {
    renderer.setScissorTest(false);
    return;
  }

  gizmoCube.quaternion.copy(camera.quaternion).invert();
  gizmoEdges.quaternion.copy(gizmoCube.quaternion);

  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setViewport(
    viewportSize.width - GIZMO_SIZE - GIZMO_MARGIN,
    viewportSize.height - GIZMO_SIZE - GIZMO_MARGIN,
    GIZMO_SIZE,
    GIZMO_SIZE
  );
  renderer.setScissor(
    viewportSize.width - GIZMO_SIZE - GIZMO_MARGIN,
    viewportSize.height - GIZMO_SIZE - GIZMO_MARGIN,
    GIZMO_SIZE,
    GIZMO_SIZE
  );
  renderer.render(gizmoScene, gizmoCamera);
  renderer.setScissorTest(false);
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  updateCameraTransition(now);

  if (wardrobeDoorPivot) {
    const targetDoorRotation = wardrobeDoorOpen ? -WARDROBE_HINGE_OPEN_ANGLE : 0;
    wardrobeDoorPivot.rotation.y +=
      (targetDoorRotation - wardrobeDoorPivot.rotation.y) * 0.14;
    updateWardrobeHingeVisibility();
  }

  if (cableGrommetFlapPivot) {
    const targetRotation = cableGrommetFlapOpen ? -1.12 : 0;
    cableGrommetFlapPivot.rotation.x +=
      (targetRotation - cableGrommetFlapPivot.rotation.x) * 0.16;
  }

  controls.update();
  renderMainScene();
  renderGizmo();
}

setProductRoute(getProductFromHash());

animate();
