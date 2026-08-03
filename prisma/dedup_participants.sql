DELETE FROM meeting_participants
WHERE id NOT IN (
  SELECT DISTINCT ON (meeting_room_id, user_id) id
  FROM meeting_participants
  ORDER BY meeting_room_id, user_id, joined_at DESC
);

