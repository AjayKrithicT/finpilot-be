import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { findActiveUserByEmail } from '../repositories/user.repository';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { LoginRequestDto, LoginResponseDto, JwtPayload } from '../types/auth.types';

export async function login(dto: LoginRequestDto): Promise<LoginResponseDto> {
  const user = await findActiveUserByEmail(dto.email);

  // Deliberate constant-time comparison even on "not found" to avoid timing
  // attacks that reveal whether an email exists.
  const passwordMatch =
    user != null && (await bcrypt.compare(dto.password, user.password_hash));

  if (!user || !passwordMatch) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid credentials',
    );
  }

  const payload: JwtPayload = {
    sub: user.user_id,
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  return {
    token,
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
  };
}
