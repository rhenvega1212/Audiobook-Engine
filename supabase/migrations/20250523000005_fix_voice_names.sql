-- Fix Jennifer voice hint: Brittany → Britney (matches ElevenLabs display name)
update characters
set elevenlabs_voice_name = 'Britney'
where canonical_name = 'Jennifer'
  and elevenlabs_voice_name = 'Brittany';
