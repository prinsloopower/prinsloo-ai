---
name: image-prompt
description: Image prompts written for AI image models, with the right kind of model chosen for the job and distinct concept variants for generating or editing. Use whenever the user wants a prompt for an AI image, a thumbnail, post image, illustration or product shot made with an image generator, or an existing image edited with one.
---
# Image prompt

A prompt is a **shot description**: what a photographer or illustrator would need to be told to make this exact picture. Describe the picture, in the order a viewer's eye would take it in.

## Gather
- What the image is for and where it will appear. The platform sets the aspect ratio: 16:9 thumbnail, 1:1 or 4:5 post, 9:16 story.
- The subject, and any text that must appear in the image.
- Reference images, or an image to edit.
- The image tool the user has, if they name one. The prompts work in any tool.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

## Steps
1. Name the kind of model the job needs, and why.
   - **Photoreal**: people, products, places.
   - **Illustration**: stylized, graphic or painterly work.
   - **Text-capable**: any image with readable words in it.
   - **Editing**: change part of an existing image and keep the rest.
   - **Reference-guided**: keep a character, product or style consistent across images.
2. Write each prompt as full sentences covering, in order: subject and action, setting, composition (shot size, angle, where the subject sits in the frame), lighting, style or medium, color palette, mood.
3. Put text to render in quotation marks, four words or fewer, and say where it sits and how it looks.
4. Write three variants that differ in concept or composition. Changing adjectives does not make a variant.
5. For an edit, state what changes, what stays exactly as it is, and the region affected.
6. For a series, write a **style block**: two or three sentences fixing the look, repeated word for word in every prompt.
7. Describe a style by its qualities: line weight, palette, texture, era. Leave out the names of living artists, real people, brands and existing characters, and say so if the user asked for one.
8. Add settings: aspect ratio, and things to exclude if the tool takes a negative prompt.
9. For thumbnails, check each concept at small size: one focal subject, strong contrast, text readable on a phone.

## Shape
```
Model kind: <which, and why>
Aspect ratio: <ratio> for <platform>

Variant A: <concept in five words>
<prompt>

Variant B ... Variant C ...

Style block (for a series)
Exclude: <negative prompt, if supported>
```

## Done when
- Every prompt covers subject, composition, lighting, style and aspect ratio.
- The three variants would produce visibly different pictures.
- Text to render is quoted and four words or fewer.
- No prompt names a living artist, a real person, a brand or an existing character.
