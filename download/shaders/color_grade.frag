#version 330 core

// ── Inputs ────────────────────────────────────────────────────────────────────
uniform sampler2D u_tex;

// Forwarded from tonemap.frag pipeline
uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

// ── Color-grade uniforms (mirror of ColorGrade.param_defs) ────────────────────
uniform float u_cg_exposure;     // EV offset on top of viewport EV
uniform float u_cg_contrast;
uniform float u_cg_saturation;
uniform float u_cg_hue_shift;    // degrees, -180..180

uniform vec3  u_cg_lift;         // per-channel shadow offset
uniform vec3  u_cg_gamma;        // per-channel midtone power  (1.0 = neutral)
uniform vec3  u_cg_gain;         // per-channel highlight scale (1.0 = neutral)

uniform int   u_cg_enabled;      // 0 = pass-through (node bypassed)

in  vec2 v_uv;
out vec4 frag_color;


// ── Tone-mapping (duplicated from tonemap.frag so shader is self-contained) ───

vec3 tm_reinhard(vec3 c)  { return c / (c + vec3(1.0)); }

vec3 tm_aces(vec3 c) {
    const float a = 2.51, b = 0.03, cc = 2.43, d = 0.59, e = 0.14;
    return clamp((c*(a*c+b))/(c*(cc*c+d)+e), 0.0, 1.0);
}

vec3 tm_uncharted2(vec3 c) {
    const float A=.15,B=.50,C=.10,D=.20,E=.02,F=.30,W=11.2;
    #define UC2(x) ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F
    vec3 curr = 2.0 * UC2(c);
    return clamp(curr / UC2(W), 0.0, 1.0);
}


// ── Hue-shift (RGB ↔ HSV, no deps) ───────────────────────────────────────────

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
    // Letterbox/pillarbox guard: pixels whose UV falls outside [0,1] are border
    // pixels, not image pixels.  Skip color-grade for them — otherwise Lift and
    // Contrast would tint the black bars around the image.
    if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
        frag_color = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec4 texel = texture(u_tex, v_uv);
    vec3 col   = texel.rgb;

    // ── 0. GPU color-grade (only when node is active) ─────────────────────────
    if (u_cg_enabled != 0) {

        // 1. Exposure
        col *= pow(2.0, u_cg_exposure);

        // 2. Lift / Gamma / Gain  (per-channel)
        for (int ch = 0; ch < 3; ch++) {
            float v = col[ch] + u_cg_lift[ch];
            if (u_cg_gamma[ch] != 1.0 && v > 0.0)
                v = pow(v, 1.0 / u_cg_gamma[ch]);
            v *= u_cg_gain[ch];
            col[ch] = v;
        }

        // 3. Contrast
        col = (col - 0.18) * u_cg_contrast + 0.18;

        // 4. Saturation
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(lum), col, u_cg_saturation);

        // 5. Hue shift
        if (abs(u_cg_hue_shift) > 0.001) {
            vec3 hsv  = rgb2hsv(max(col, 0.0));
            hsv.x     = fract(hsv.x + u_cg_hue_shift / 360.0);
            col       = hsv2rgb(hsv);
        }
    }

    // ── Viewport-level exposure (from _ViewportStrip) ─────────────────────────
    col *= pow(2.0, u_ev);

    // ── Channel isolation ─────────────────────────────────────────────────────
    if      (u_channel == 1) col = vec3(col.r);
    else if (u_channel == 2) col = vec3(col.g);
    else if (u_channel == 3) col = vec3(col.b);
    else if (u_channel == 4) col = vec3(texel.a);

    // ── Tone mapping ──────────────────────────────────────────────────────────
    if (u_channel == 0) {
        if      (u_tonemap == 0) col = tm_reinhard(col);
        else if (u_tonemap == 1) col = tm_aces(col);
        else if (u_tonemap == 2) col = tm_uncharted2(col);
        else                     col = clamp(col, 0.0, 1.0);
    } else {
        col = col / (col + vec3(1.0));
    }

    // ── Gamma ─────────────────────────────────────────────────────────────────
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / u_gamma));

    frag_color = vec4(col, 1.0);
}
