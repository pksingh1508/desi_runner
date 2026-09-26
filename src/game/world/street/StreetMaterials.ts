import * as THREE from "three";
import type { StreetAtlas } from "../textures/StreetAtlas";
import type { FacadeAtlas } from "../textures/FacadeAtlas";

/** Shader uniforms shared by the street materials (driven by BiomeManager). */
export interface StreetUniforms {
  uTime: THREE.IUniform<number>;
  /** 0 dry → 1 monsoon-soaked asphalt. */
  uWetness: THREE.IUniform<number>;
  /** Festive bulb twinkle amount (Diwali). */
  uTwinkle: THREE.IUniform<number>;
}

export function createStreetUniforms(): StreetUniforms {
  return { uTime: { value: 0 }, uWetness: { value: 0 }, uTwinkle: { value: 0 } };
}

/**
 * Asphalt / kerb / footpath material. Roughness map: G = dry roughness,
 * B = puddle mask. Wetness darkens the albedo and drops roughness so the
 * road picks up sky reflections from the biome environment map.
 */
export function createStreetMaterial(atlas: StreetAtlas, uniforms: StreetUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: atlas.map,
    roughnessMap: atlas.roughnessMap,
    roughness: 1,
    metalness: 0,
  });
  material.name = "StreetMaterial";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = uniforms.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWetness;")
      .replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          float puddle = texelRoughness.b;
          float wetRough = mix( 0.36, 0.1, puddle );
          roughnessFactor *= mix( texelRoughness.g, wetRough, uWetness );
          diffuseColor.rgb *= mix( 1.0, mix( 0.58, 0.42, puddle ), uWetness );
        #endif
        `
      );
  };
  material.customProgramCacheKey = () => "desi-street-v1";
  return material;
}

/**
 * Facade material for every baked building / prop / overhead variant.
 * Atlas alpha decodes into: cut-out (<0.3), keep painted color (~0.59), or
 * multiply by the vertex tint (1.0). Vertex alpha < 1 marks twinkling
 * festive bulbs (value = phase). Night glow = emissive atlas × biome
 * `emissiveIntensity`.
 */
export function createFacadeMaterial(atlas: FacadeAtlas, uniforms: StreetUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: atlas.map,
    emissiveMap: atlas.emissiveMap,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  material.name = "FacadeMaterial";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uTwinkle = uniforms.uTwinkle;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uTwinkle;")
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        float tintAmount = 1.0;
        #ifdef USE_MAP
          vec4 atlasTexel = texture2D( map, vMapUv );
          if ( atlasTexel.a < 0.3 ) discard;
          tintAmount = smoothstep( 0.66, 0.9, atlasTexel.a );
          diffuseColor.rgb *= atlasTexel.rgb;
        #endif
        `
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        #if defined( USE_COLOR_ALPHA )
          diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, tintAmount );
        #elif defined( USE_COLOR )
          diffuseColor.rgb *= mix( vec3( 1.0 ), vColor, tintAmount );
        #endif
        `
      )
      .replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `
        #ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          float twinklePhase = 1.0;
          #if defined( USE_COLOR_ALPHA )
            twinklePhase = vColor.a;
          #endif
          float twinkleOn = step( twinklePhase, 0.985 ) * uTwinkle;
          float flicker = 0.55 + 0.45 * sin( uTime * ( 2.2 + twinklePhase * 5.0 ) + twinklePhase * 91.0 );
          totalEmissiveRadiance *= emissiveColor.rgb * mix( 1.0, flicker, twinkleOn );
        #endif
        `
      );
  };
  material.customProgramCacheKey = () => "desi-facade-v1";
  return material;
}
