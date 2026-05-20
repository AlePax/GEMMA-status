#version 330 core

// Final DoF blend pass: triangle-hat blend of sharp + 3 Gaussian levels using
// the smoothed CoC map, followed by EV / tonemap / gamma for display.
//
// u_sharp is a numpy/EXR texture (top-left origin) → Y-flipped when sampling.
// All other inputs are GL-native FBO textures → sampled at v_uv directly.

uniform sampler2D u_sharp;  // TEXTURE0 — sharp image (numpy top-left)
uniform sampler2D u_blur1;  // TEXTURE1 — blur level 1 (sigma = max_blur/3 * 0.35)
uniform sampler2D u_blur2;  // TEXTURE2 — blur level 2 (sigma = max_blur*2/3 * 0.35)
uniform sampler2D u_blur3;  // TEXTURE3 — blur level 3 (sigma = max_blur * 0.35)
uniform sampler2D u_coc;    // TEXTURE4 — Gaussian-smoothed CoC map (R channel)

uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

in  vec2 v_uv;
out vec4 frag_color;

vec3 tm_reinhard(vec3 c)  { return c / (c + vec3(1.0)); }
vec3 tm_aces(vec3 c) {
    const float a=2.51, b=0.03, cc=2.43, d=0.59, e=0.14;
    return clamp((c*(a*c+b))/(c*(cc*c+d)+e), 0.0, 1.0);
}
vec3 tm_uncharted2(vec3 c) {
    const float A=.15,B=.50,C=.10,D=.20,E=.02,F=.30,W=11.2;
    #define UC2(x) ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F
    return clamp(2.0*UC2(c) / UC2(W), 0.0, 1.0);
}

void main() {
    // Sharp uses Y-flip (numpy); FBO textures use v_uv directly.
    vec2 sharp_uv = vec2(v_uv.x, 1.0 - v_uv.y);

    vec4 sharp_rgba = texture(u_sharp, sharp_uv);
    float alp = sharp_rgba.a;

    float coc = clamp(texture(u_coc,   v_uv).r, 0.0, 1.0);
    vec3  b1  = texture(u_blur1, v_uv).rgb;
    vec3  b2  = texture(u_blur2, v_uv).rgb;
    vec3  b3  = texture(u_blur3, v_uv).rgb;

    // Triangle-hat blend: c3 = coc*3, exactly two adjacent weights non-zero, sum = 1.
    float c3 = coc * 3.0;
    float w0 = clamp(1.0 - abs(c3 - 0.0), 0.0, 1.0);
    float w1 = clamp(1.0 - abs(c3 - 1.0), 0.0, 1.0);
    float w2 = clamp(1.0 - abs(c3 - 2.0), 0.0, 1.0);
    float w3 = clamp(1.0 - abs(c3 - 3.0), 0.0, 1.0);

    vec3 col = sharp_rgba.rgb * w0 + b1 * w1 + b2 * w2 + b3 * w3;
    col *= pow(2.0, u_ev);

    if      (u_channel == 1) col = vec3(col.r);
    else if (u_channel == 2) col = vec3(col.g);
    else if (u_channel == 3) col = vec3(col.b);
    else if (u_channel == 4) col = vec3(alp);

    if (u_channel == 0) {
        if      (u_tonemap == 0) col = tm_reinhard(col);
        else if (u_tonemap == 1) col = tm_aces(col);
        else if (u_tonemap == 2) col = tm_uncharted2(col);
        else                     col = clamp(col, 0.0, 1.0);
    } else {
        col = col / (col + vec3(1.0));
    }

    col        = pow(clamp(col, 0.0, 1.0), vec3(1.0 / u_gamma));
    frag_color = vec4(col, 1.0);
}
