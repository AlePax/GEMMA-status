#version 330 core

// Separable Gaussian blur pass — used for both image blur levels and CoC smoothing.
// u_flip_y = 1 when reading numpy/EXR top-left textures (sharp image, CoC fbo is GL-native).
// u_horizontal = 1 for H pass, 0 for V pass.
// sigma and radius must match: radius = min(int(r), 64), sigma = r * 0.35.

uniform sampler2D u_tex;
uniform int   u_flip_y;      // 1 = flip v_uv.y (numpy source), 0 = FBO source
uniform int   u_horizontal;  // 1 = horizontal, 0 = vertical
uniform float u_sigma;       // Gaussian sigma (pixels)
uniform int   u_radius;      // kernel half-width in pixels
uniform float u_step;        // texel step: 1/image_width (H) or 1/image_height (V)

in  vec2 v_uv;
out vec4 frag_color;

void main() {
    vec2 uv = (u_flip_y != 0) ? vec2(v_uv.x, 1.0 - v_uv.y) : v_uv;

    if (u_sigma < 0.3 || u_radius < 1) {
        frag_color = texture(u_tex, uv);
        return;
    }

    float inv_2sig2 = 1.0 / (2.0 * u_sigma * u_sigma);
    vec2  dir       = (u_horizontal != 0) ? vec2(u_step, 0.0) : vec2(0.0, u_step);

    vec4  sum  = vec4(0.0);
    float wsum = 0.0;
    for (int i = -u_radius; i <= u_radius; i++) {
        float w  = exp(-float(i * i) * inv_2sig2);
        sum     += texture(u_tex, uv + dir * float(i)) * w;
        wsum    += w;
    }
    frag_color = sum / wsum;
}
