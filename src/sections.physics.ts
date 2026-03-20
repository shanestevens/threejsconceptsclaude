import type { Section } from './types'

export const physicsSections: Section[] = [
  {
    id: 'physics-rigid-bodies',
    title: 'Rigid Bodies',
    subtitle: 'Dynamic · Static · Colliders · Restitution',
    description:
      'The foundation of physics simulation. <strong>Rigid bodies</strong> are objects that never deform — their shape is fixed, only position and rotation change. <strong>Dynamic</strong> bodies respond to gravity and forces. <strong>Static</strong> bodies (floors, walls) never move but block dynamic ones. Each body needs a <strong>collider</strong> — the actual shape used for collision detection (box, sphere, capsule). Rapier runs the entire simulation on the CPU, stepping the world forward by a fixed timestep each frame.',
    tags: ['RigidBodyDesc', 'ColliderDesc', 'dynamic', 'fixed', 'world.step()'],
    code: `import RAPIER from '@dimforge/rapier3d-compat'
await RAPIER.init()

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

// Static floor — never moves, blocks everything
const floorBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
)
world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10), floorBody)

// Dynamic box — falls under gravity
const boxBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0)
)
world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)   // half-extents!
    .setRestitution(0.4)                         // bounciness
    .setFriction(0.8),
  boxBody
)

// Each frame: step → sync Three.js mesh
function animate() {
  world.step()
  const t = boxBody.translation()
  const r = boxBody.rotation()
  mesh.position.set(t.x, t.y, t.z)
  mesh.quaternion.set(r.x, r.y, r.z, r.w)
}`,
  },
  {
    id: 'physics-wrecking-ball',
    title: 'Wrecking Ball',
    subtitle: 'Kinematic Bodies · Pendulum · Destruction',
    description:
      'A <strong>kinematic</strong> body is driven by code — not physics — but still pushes dynamic bodies out of its way. This makes it perfect for scripted objects like elevators, platforms, or a wrecking ball following a pendulum arc. The ball\'s position is updated each frame with <code>setNextKinematicTranslation()</code> using a sine-wave angle. When it swings into the wall of boxes, the kinematic collider pushes them aside with full physical response — domino-effect destruction.',
    tags: ['kinematicPositionBased', 'setNextKinematicTranslation', 'pendulum', 'destruction'],
    code: `// Kinematic body: code-driven but physically solid
const ballDesc = RAPIER.RigidBodyDesc
  .kinematicPositionBased()
  .setTranslation(0, 6, 0)
const ballBody = world.createRigidBody(ballDesc)
world.createCollider(RAPIER.ColliderDesc.ball(0.7), ballBody)

const PIVOT_Y = 10, ROPE = 7

function animate(time: number) {
  world.step()

  // Pendulum math — pure sine wave
  const angle = Math.sin(time * 1.1) * 1.1
  ballBody.setNextKinematicTranslation({
    x: Math.sin(angle) * ROPE,
    y: PIVOT_Y - Math.cos(angle) * ROPE,
    z: -4,
  })

  syncMeshes()  // copy translation/rotation from dynamic boxes
}`,
  },
  {
    id: 'physics-dominoes',
    title: 'Dominoes',
    subtitle: 'Chain Reaction · Collision Events · Impulse',
    description:
      'Each domino is a thin <strong>dynamic rigid body</strong>. When the first one tips, it collides with the next, which collides with the next — a chain reaction driven entirely by the physics engine. The dominoes are arranged along a <strong>parametric S-curve</strong>, with each one oriented tangent to the curve using a quaternion rotation. No collision events or scripting required: pure emergent behaviour from the simulation stepping forward 1/60s at a time.',
    tags: ['chain reaction', 'RigidBodyDesc.dynamic', 'quaternion', 'ColliderDesc.cuboid'],
    code: `// Place 40 dominoes along an S-curve
for (let i = 0; i < 40; i++) {
  const t = i / 39
  const x = Math.sin(t * Math.PI * 2) * 4
  const z = (t - 0.5) * 14

  // Orient each domino tangent to the curve
  const dx = Math.cos(t * Math.PI * 2) * Math.PI * 2 * 4
  const dz = 14
  const angle = Math.atan2(dx, dz)
  const quat = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0,1,0), angle)

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, 0.35, z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.08, 0.35, 0.22),
    body
  )
}

// Tip the first domino to start the chain
dominoes[0].applyImpulse({ x: 0, y: 0, z: -2 }, true)`,
  },
  {
    id: 'physics-jenga',
    title: 'Jenga',
    subtitle: 'Raycasting · Mouse Interaction · Impulse Forces',
    description:
      'Physics becomes interactive through <strong>raycasting</strong>. A ray is cast from the camera through the mouse position into the physics world. When it hits a block, <code>applyImpulse()</code> gives it a sharp push — the tower physics does the rest. Jenga demonstrates alternating layer stacking (a classic <em>brick bond</em> pattern), and how even a small impulse propagates through a stack of resting contacts, leading to satisfying collapse.',
    tags: ['castRay', 'applyImpulse', 'raycasting', 'interactive', 'Raycaster'],
    code: `// Click → raycast → apply impulse to hit block
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width)  * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )

  // Three.js ray into Rapier ray
  raycaster.setFromCamera(mouse, camera)
  const o = raycaster.ray.origin
  const d = raycaster.ray.direction

  const ray = new RAPIER.Ray(
    { x: o.x, y: o.y, z: o.z },
    { x: d.x, y: d.y, z: d.z },
  )
  const hit = world.castRay(ray, 100, true)
  if (!hit) return

  const body = hit.collider.parent()!
  body.applyImpulse(
    { x: (Math.random()-0.5)*8, y: 3, z: (Math.random()-0.5)*8 },
    true   // wake up sleeping body
  )
})`,
  },
  {
    id: 'physics-ragdoll',
    title: 'Ragdoll',
    subtitle: 'Joints · Spherical Constraints · Articulated Bodies',
    description:
      'A ragdoll is a hierarchy of rigid bodies connected by <strong>joints</strong>. Each joint constrains the relative position and rotation between two bodies — a <em>spherical</em> joint acts like a ball-and-socket (shoulder, hip), a <em>revolute</em> joint allows rotation around a single axis (elbow, knee). The result is an articulated character that responds to gravity and collisions realistically. This is the basis of how AAA games simulate death animations, cloth, vehicles, and more.',
    tags: ['ImpulseJoint', 'JointData.spherical', 'articulated', 'constraints', 'damping'],
    code: `// Connect head to torso with a spherical (ball-socket) joint
const neckJoint = RAPIER.JointData.spherical(
  { x: 0,  y: 0.32,  z: 0 },   // anchor in torso local space
  { x: 0,  y: -0.22, z: 0 },   // anchor in head local space
)
world.createImpulseJoint(neckJoint, torsoBody, headBody, true)

// Elbow — revolute (single axis rotation)
const elbowJoint = RAPIER.JointData.revolute(
  { x: 0, y: -0.22, z: 0 },    // bottom of upper arm
  { x: 1, y: 0,     z: 0 },    // rotation axis
  { x: 0, y:  0.20, z: 0 },    // top of lower arm
  { x: 1, y: 0,     z: 0 },
)
world.createImpulseJoint(elbowJoint, upperArmBody, lowerArmBody, true)

// Add damping so the ragdoll doesn't flail forever
headBody.setLinearDamping(0.1)
headBody.setAngularDamping(0.4)`,
  },
]
