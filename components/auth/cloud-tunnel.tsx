"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const CLOUD_CLUSTERS = 150;
const MIN_CLOUDS_PER_CLUSTER = 3;
const MAX_CLOUDS_PER_CLUSTER = 6;
const CLOUD_DEPTH = 8000;
const SKY_BLUE = 0x2da8e8;
const FOG_BLUE = 0xffffff;

export function CloudTunnel() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const container = root;

    let frame = 0;
    let width = root.clientWidth || window.innerWidth;
    let height = root.clientHeight || window.innerHeight;
    let mouseX = 0;
    let mouseY = 0;
    let cameraX = 0;
    let cameraY = 0;
    const start = performance.now();

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.setClearColor(SKY_BLUE, 0);
    renderer.domElement.className = "absolute inset-0 h-full w-full";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_BLUE, -100, 3000);

    const camera = new THREE.PerspectiveCamera(30, width / height, 1, 9000);
    camera.position.z = 6000;

    const loader = new THREE.TextureLoader();
    const texture = loader.load("/login-cloud.png");
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        fogColor: { value: new THREE.Color(FOG_BLUE) },
        fogNear: { value: -100 },
        fogFar: { value: 3000 },
        opacity: { value: 0.42 },
        cloudWhite: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        uniform float opacity;
        uniform vec3 cloudWhite;
        varying vec2 vUv;
        void main() {
          float depth = gl_FragCoord.z / gl_FragCoord.w;
          float fogFactor = smoothstep(fogNear, fogFar, depth);
          vec4 texel = texture2D(map, vUv);
          float shape = max(max(texel.r, texel.g), texel.b);
          shape = smoothstep(0.42, 0.92, shape);
          float nearFade = pow(gl_FragCoord.z, 16.0);
          float farFade = 1.0 - smoothstep(0.55, 1.0, fogFactor) * 0.38;
          float alpha = texel.a * shape * opacity * nearFade * farFade;
          vec3 color = cloudWhite;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    const geometry = new THREE.PlaneGeometry(220, 220);
    const groupA = new THREE.Group();
    const groupB = new THREE.Group();

    function fillCloudGroup(group: THREE.Group, zOffset: number) {
      for (let i = 0; i < CLOUD_CLUSTERS; i += 1) {
        const clusterX = Math.random() * 3200 - 1600;
        const clusterY = Math.random() * 180 - Math.random() * Math.random() * 520 - 40;
        const clusterZ = (i / CLOUD_CLUSTERS) * CLOUD_DEPTH + zOffset;
        const pieces = Math.floor(Math.random() * (MAX_CLOUDS_PER_CLUSTER - MIN_CLOUDS_PER_CLUSTER + 1)) + MIN_CLOUDS_PER_CLUSTER;

        for (let j = 0; j < pieces; j += 1) {
          const mesh = new THREE.Mesh(geometry, material);
          const clusterSpread = Math.random() * 220 + 80;
          mesh.position.x = clusterX + (Math.random() - 0.5) * clusterSpread;
          mesh.position.y = clusterY + (Math.random() - 0.5) * clusterSpread * 0.38;
          mesh.position.z = clusterZ + (Math.random() - 0.5) * 180;
          mesh.rotation.z = Math.random() * Math.PI;
          const scale = Math.random() * Math.random() * 1.9 + 0.72;
          const scaleX = scale * (0.72 + Math.random() * 0.95);
          const scaleY = scale * (0.52 + Math.random() * 0.65);
          mesh.scale.set(scaleX, scaleY, 1);
          group.add(mesh);
        }
      }
    }

    fillCloudGroup(groupA, 0);
    fillCloudGroup(groupB, -CLOUD_DEPTH);
    scene.add(groupA, groupB);

    function handlePointerMove(event: PointerEvent) {
      mouseX = (event.clientX - window.innerWidth / 2) * 0.25;
      mouseY = (event.clientY - window.innerHeight / 2) * 0.15;
    }

    function handleResize() {
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("resize", handleResize);

    function animate(now: number) {
      const position = ((now - start) * 0.038) % CLOUD_DEPTH;
      cameraX += (mouseX - cameraX) * 0.018;
      cameraY += (-mouseY - cameraY) * 0.018;
      camera.position.x = cameraX;
      camera.position.y = cameraY;
      camera.position.z = -position + CLOUD_DEPTH;
      camera.lookAt(cameraX, cameraY, camera.position.z - 1000);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
      container.removeChild(renderer.domElement);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={rootRef} className="absolute inset-0" aria-hidden="true" />;
}
