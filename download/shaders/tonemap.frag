#version 330 core

// ─── Uniforms ─────────────────────────────────────────────────────────────────
uniform sampler2D u_tex;
uniform float     u_ev;          // Exposure in EV  (default 0.0)
uniform float     u_gamma;       // Gamma            (default 2.2)
uniform int       u_tonemap;     // 0=Reinhard 1=ACES 2=Uncharted2 3=Linear
uniform int       u_channel;     // 0=RGB 1=R 2=G 3=B 4=A

in  vec2 v_uv;
out vec4 frag_color;


// ─── Tone mapping operators ───────────────────────────────────────────────────

vec3 tm_reinhard(vec3 c) {
    return c / (c + vec3(1.0));
}

vec3 tm_aces_filmic(vec3 c) {
    // Narkowicz 2015 ACES approximation
    const float a = 2.51;
    const float b = 0.03;
    const float cc = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((c * (a * c + b)) / (c * (cc * c + d) + e), 0.0, 1.0);
}

vec3 tm_uncharted2(vec3 c) {
    // John Hable's Uncharted 2 filmic curve
    const float A = 0.15;
    const float B = 0.50;
    const float C = 0.10;
    const float D = 0.20;
    const float E = 0.02;
    const float F = 0.30;
    const float W = 11.2;

    #define UC2(x) ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F

    vec3 curr = 2.0 * UC2(c);
    float white_scale = 1.0 / (UC2(W));
    return clamp(curr * white_scale, 0.0, 1.0);
}

vec3 tm_linear(vec3 c) {
    return clamp(c, 0.0, 1.0);
}


// ─── Main ─────────────────────────────────────────────────────────────────────
void main() {
    vec4 texel = texture(u_tex, v_uv);

    // Exposure
    vec3 col = texel.rgb * pow(2.0, u_ev);
    float alpha = texel.a;

    // Channel isolation
    if (u_channel == 1) {          // R
        col = vec3(col.r);
    } else if (u_channel == 2) {   // G
        col = vec3(col.g);
    } else if (u_channel == 3) {   // B
        col = vec3(col.b);
    } else if (u_channel == 4) {   // A
        col = vec3(alpha);
    }
    // u_channel == 0 → RGB passthrough

    // Tone mapping (skip if channel isolation → no HDR collapse needed for R/G/B/A solo)
    if (u_channel == 0) {
        if      (u_tonemap == 0) col = tm_reinhard(col);
        else if (u_tonemap == 1) col = tm_aces_filmic(col);
        else if (u_tonemap == 2) col = tm_uncharted2(col);
        else                     col = tm_linear(col);
    } else {
        // For single-channel views apply simple Reinhard to keep range sane
        col = col / (col + vec3(1.0));
    }

    // Gamma correction
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / u_gamma));

    frag_color = vec4(col, 1.0);
}
