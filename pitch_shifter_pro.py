#!/usr/bin/env python3
"""
Professional Audio Pitch Shifter

High-quality pitch shifting without tempo changes or artifacts.
Optimized for BLE audio streams and professional applications.

Requirements:
- librosa: for high-quality pitch shifting
- soundfile: for reading/writing audio files
- numpy: for numerical operations
- pyrubberband: for professional DAW-quality results (optional)

Usage:
    python pitch_shifter_pro.py input.wav output.wav semitones [--method METHOD]
    
Example:
    python pitch_shifter_pro.py input.wav output.wav 2 --method librosa
    python pitch_shifter_pro.py input.wav output.wav -3 --method rubberband
"""

import argparse
import sys
import os
import numpy as np

try:
    import librosa
    import soundfile as sf
except ImportError as e:
    print(f"Error: Required library not installed: {e}")
    print("Please install required dependencies:")
    print("pip install librosa soundfile numpy")
    sys.exit(1)

# Check for optional pyrubberband
try:
    import pyrubberband as pyrb
    RUBBERBAND_AVAILABLE = True
except ImportError:
    RUBBERBAND_AVAILABLE = False


def pitch_shift_librosa(audio_data, sr, semitones):
    """
    High-quality pitch shifting using librosa's advanced algorithm.
    Optimized for BLE audio streams and minimal artifacts.
    """
    if semitones == 0:
        return audio_data
    
    # Use librosa's sophisticated phase vocoder with harmonic-percussive separation
    shifted = librosa.effects.pitch_shift(
        audio_data, 
        sr=sr, 
        n_steps=semitones,
        hop_length=512,  # Good balance of quality and speed
        res_type='kaiser_best'  # Highest quality resampling
    )
    return shifted


def pitch_shift_rubberband(audio_data, sr, semitones):
    """
    Professional DAW-quality pitch shifting using Rubber Band.
    Uses time-domain PSOLA for natural sounding results.
    """
    if not RUBBERBAND_AVAILABLE:
        raise ImportError("pyrubberband not installed. Install with: pip install pyrubberband")
    
    if semitones == 0:
        return audio_data
    
    # Use pyrubberband for professional quality
    shifted = pyrb.pitch_shift(audio_data, sr, n_steps=semitones)
    return shifted


def pitch_shift_ble_audio(audio_data, semitones=0, method='librosa'):
    """
    Process audio chunks from nRF52840 BLE stream.
    Optimized for 16kHz audio streams.
    
    Args:
        audio_data: Audio data as int16 or float32
        semitones: Number of semitones to shift
        method: 'librosa' or 'rubberband'
    """
    # Convert int16 to float32 if needed
    if audio_data.dtype == np.int16:
        audio_float = audio_data.astype(np.float32) / 32768.0
    else:
        audio_float = audio_data
    
    # Apply pitch shift
    if method == 'rubberband':
        shifted = pitch_shift_rubberband(audio_float, 16000, semitones)
    else:  # default to librosa
        shifted = pitch_shift_librosa(audio_float, 16000, semitones)
    
    # Convert back to int16 if original was int16
    if audio_data.dtype == np.int16:
        return (shifted * 32767).astype(np.int16)
    else:
        return shifted


def pitch_shift_audio(input_file, output_file, semitones, method='librosa'):
    """
    Pitch shift an audio file using professional methods.
    
    Args:
        input_file (str): Path to input WAV file
        output_file (str): Path to output WAV file
        semitones (float): Number of semitones to shift
        method (str): 'librosa' or 'rubberband'
    """
    try:
        # Load the audio file
        print(f"Loading audio file: {input_file}")
        y, sr = librosa.load(input_file, sr=None)
        print(f"Sample rate: {sr} Hz")
        print(f"Duration: {len(y) / sr:.2f} seconds")
        
        # Convert semitones to pitch shift ratio for display
        pitch_factor = 2 ** (semitones / 12.0)
        print(f"Pitch shift: {semitones} semitones (factor: {pitch_factor:.3f})")
        
        # Apply pitch shifting
        print(f"Processing audio using '{method}' method...")
        
        if method == 'rubberband':
            if not RUBBERBAND_AVAILABLE:
                print("Warning: pyrubberband not available, falling back to librosa")
                method = 'librosa'
            else:
                y_shifted = pitch_shift_rubberband(y, sr, semitones)
        
        if method == 'librosa':
            y_shifted = pitch_shift_librosa(y, sr, semitones)
        
        # Save the processed audio
        print(f"Saving processed audio to: {output_file}")
        sf.write(output_file, y_shifted, sr)
        
        print("✓ Professional pitch shifting completed successfully!")
        print(f"✓ Method used: {method}")
        
    except FileNotFoundError:
        print(f"Error: Input file '{input_file}' not found.")
        sys.exit(1)
    except Exception as e:
        print(f"Error processing audio: {e}")
        sys.exit(1)


def interactive_mode():
    """
    Interactive mode for user input.
    """
    print("=== Professional Audio Pitch Shifter ===")
    print()
    
    # Get input file
    while True:
        input_file = input("Enter path to input WAV file: ").strip()
        if os.path.exists(input_file):
            break
        print(f"File '{input_file}' not found. Please try again.")
    
    # Get output file
    output_file = input("Enter path for output WAV file: ").strip()
    if not output_file:
        base, ext = os.path.splitext(input_file)
        output_file = f"{base}_pitched{ext}"
        print(f"Using default output file: {output_file}")
    
    # Get pitch shift amount
    while True:
        try:
            semitones = float(input("Enter pitch shift in semitones (positive = up, negative = down): "))
            break
        except ValueError:
            print("Please enter a valid number.")
    
    # Get method
    methods = ['librosa']
    if RUBBERBAND_AVAILABLE:
        methods.append('rubberband')
    
    print(f"Available methods: {', '.join(methods)}")
    method = input(f"Choose method ({'/'.join(methods)}) [librosa]: ").strip().lower()
    if not method or method not in methods:
        method = 'librosa'
    
    return input_file, output_file, semitones, method


def main():
    """
    Main function to handle command line arguments and execute pitch shifting.
    """
    parser = argparse.ArgumentParser(
        description="Professional pitch shifter without tempo changes or artifacts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Methods:
  librosa     - High-quality phase vocoder (recommended for BLE audio)
  rubberband  - Professional DAW-quality (requires pyrubberband)

Examples:
  %(prog)s input.wav output.wav 2                    # Librosa method, +2 semitones
  %(prog)s input.wav output.wav -3 --method rubberband  # Rubber Band method, -3 semitones
  %(prog)s input.wav output.wav 5 --method librosa      # Perfect for BLE audio streams
  %(prog)s                                               # Interactive mode

BLE Audio Processing:
  This tool is optimized for 16kHz BLE audio streams from nRF52840 devices.
  Use librosa method for best balance of quality and performance.
        """
    )
    
    parser.add_argument("input_file", nargs='?', help="Input WAV file path")
    parser.add_argument("output_file", nargs='?', help="Output WAV file path")
    parser.add_argument("semitones", nargs='?', type=float, help="Pitch shift in semitones")
    
    methods = ['librosa']
    if RUBBERBAND_AVAILABLE:
        methods.append('rubberband')
    
    parser.add_argument("--method", choices=methods, default='librosa',
                       help=f"Processing method (default: librosa)")
    
    args = parser.parse_args()
    
    # Show available methods
    if not RUBBERBAND_AVAILABLE and len(sys.argv) == 1:
        print("Note: Install pyrubberband for professional DAW-quality results:")
        print("pip install pyrubberband")
        print()
    
    # Check if all arguments are provided
    if args.input_file and args.output_file and args.semitones is not None:
        # Command line mode
        pitch_shift_audio(args.input_file, args.output_file, args.semitones, args.method)
    else:
        # Interactive mode
        input_file, output_file, semitones, method = interactive_mode()
        pitch_shift_audio(input_file, output_file, semitones, method)


def process_ble_chunk(chunk_data, semitones=0):
    """
    Example function for real-time BLE audio processing.
    Perfect for nRF52840 audio streams.
    
    Args:
        chunk_data: Audio chunk as int16 numpy array
        semitones: Number of semitones to shift
    
    Returns:
        Processed audio chunk as int16 numpy array
    """
    return pitch_shift_ble_audio(chunk_data, semitones, method='librosa')


if __name__ == "__main__":
    main()
