import fs from 'fs/promises';
import path from 'path';
import { User } from '@/types/auth';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
const ensureDataDir = async () => {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
};

// Read users from file
export const getUsers = async (): Promise<User[]> => {
  await ensureDataDir();
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or error parsing, return empty array
    return [];
  }
};

// Save users to file
const saveUsers = async (users: User[]) => {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
};

// Create user
export const createUser = async (username: string, password: string): Promise<User> => {
  const users = await getUsers();
  
  if (users.find(u => u.username === username)) {
    throw new Error('Username already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  
  const newUser: User = {
    id: crypto.randomUUID(),
    username,
    password: hashedPassword,
    createdAt: Date.now()
  };

  users.push(newUser);
  await saveUsers(users);
  
  return newUser;
};

// Verify user
export const verifyUser = async (username: string, password: string): Promise<User | null> => {
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;
  
  return user;
};
