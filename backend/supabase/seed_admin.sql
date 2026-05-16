DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- 1. Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'theestovix@gmail.com') THEN
    -- If user exists, just ensure they are admin
    UPDATE public.user_roles 
    SET role = 'admin' 
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'theestovix@gmail.com');
  ELSE
    -- 2. Insert into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'theestovix@gmail.com',
      crypt('estovix@2026', gen_salt('bf')),
      now(),
      '{"first_name": "Admin", "last_name": "User", "username": "admin"}',
      now(),
      now(),
      ''
    );

    -- 3. The 'handle_new_user' trigger will automatically create the profile.
    -- We just force the role to be 'admin' to be absolutely safe.
    UPDATE public.user_roles SET role = 'admin' WHERE user_id = new_user_id;
  END IF;
END $$;
