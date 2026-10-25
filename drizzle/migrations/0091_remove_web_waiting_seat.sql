DELETE FROM public.waiting_room_push_queue WHERE seat_id IN (SELECT id FROM public.waiting_room_seats WHERE session_id='d9f60155-cca0-44c5-b01f-9506700841d4');
DELETE FROM public.waiting_room_seats WHERE session_id='d9f60155-cca0-44c5-b01f-9506700841d4';
UPDATE public.waiting_room_state SET revision = revision + 1;