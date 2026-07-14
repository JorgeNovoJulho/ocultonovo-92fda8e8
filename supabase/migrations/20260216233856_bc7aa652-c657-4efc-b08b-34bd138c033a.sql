
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
CHECK (type = ANY (ARRAY['message','like','subscription','follow','comment','new_follower','new_message','post_like','post_comment','visit','mention','story_reply','unlock','charge','security','system','founder_status','verification_rejected','looking_now_match','perfect_pair_match']));
