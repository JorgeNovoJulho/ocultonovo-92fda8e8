
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'follows') THEN
        DROP POLICY IF EXISTS "Usuários podem seguir" ON follows;
        CREATE POLICY "Usuários podem seguir" ON follows 
        FOR INSERT WITH CHECK (auth.uid() = follower_id);

        DROP POLICY IF EXISTS "Usuários podem deixar de seguir" ON follows;
        CREATE POLICY "Usuários podem deixar de seguir" ON follows 
        FOR DELETE USING (auth.uid() = follower_id);
        
        DROP POLICY IF EXISTS "Leitura pública de follows" ON follows;
        CREATE POLICY "Leitura pública de follows" ON follows 
        FOR SELECT USING (true);
    END IF;
END $$;
