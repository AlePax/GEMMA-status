#version 330 core

uniform sampler2D u_tex;
uniform float u_ev;
uniform float u_gamma;
uniform int   u_tonemap;
uniform int   u_channel;

// Sharpen params (unsharp mask)
uniform float u_strength;   // 0..3
uniform float u_radius;     // 0.5..5 pixels

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

// 5-tap approximate box blur in H + V, averaged (matches CPU unsharp mask kernel)
vec3 boxBlur(vec2 uv, vec2 ts, float r) {
    vec3 s = vec3(0.0);
    s  = texture(u_tex, uv).rgb * 0.36787;   // center  (e^-1 weight ≈ 0-offset)
    s += texture(u_tex, uv + vec2( r * ts.x, 0.0)).rgb * 0.13533;  // +r horiz
    s += texture(u_tex, uv + vec2(-r * ts.x, 0.0)).rgb * 0.13533;
    s += texture(u_tex, uv + vec2(0.0,  r * ts.y)).rgb * 0.13533;  // +r vert
    s += texture(u_tex, uv + vec2(0.0, -r * ts.y)).rgb * 0.13533;
    return s / (0.36787 + 4.0 * 0.13533);
}

void main() {
    if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
        frag_color = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    vec4 texel  = texture(u_tex, v_uv);
    vec2 ts     = 1.0 / vec2(textureSize(u_tex, 0));
    vec3 sharp  = texel.rgb;
    vec3 blurred = boxBlur(v_uv, ts, u_radius);
    // Unsharp mask: original + strength * (original - blurred)
    vec3 col    = sharp + u_strength * (sharp - blurred);

    col *= pow(2.0, u_ev);

    if      (u_channel == 1) col = vec3(col.r);
    else if (u_channel == 2) col = vec3(col.g);
    else if (u_channel == 3) col = vec3(col.b);
    else if (u_channel == 4) col = vec3(texel.a);

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
