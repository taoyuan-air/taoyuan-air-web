"""Global options precede the action; action-specific options follow it."""
import argparse
import importlib
import json
import os
import re
import sys
from pathlib import Path

COMMANDS = {
    'export': 'data.export', 'train': 'models.train', 'predict': 'spatial.predict',
    'validate': 'evaluation.spatial_validation', 'compare': 'evaluation.comparison',
    'shap': 'reporting.shap_report', 'plot': 'reporting.maps',
    'history-map': 'reporting.history_map',
}


def main() -> None:
    parser = argparse.ArgumentParser(description='Taoyuan ML offline pipeline',
        epilog='Example: taoyuan-ml --dataset-id meteo-v1 --run-id pm25-v1 train --variable pm25')
    parser.add_argument('--env-file', type=Path, help='Default: ml/.env; may use backend/.env explicitly')
    parser.add_argument('--config', type=Path, help='TOML overrides for export/train')
    parser.add_argument('--data-root', type=Path, help='Default: project data directory')
    parser.add_argument('--dataset-id', help='Required for export/train; otherwise inferred from run')
    parser.add_argument('--run-id', help='New ID for train, existing ID for other actions')
    parser.add_argument('command', choices=COMMANDS)
    parser.add_argument('arguments', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    help_only = '-h' in args.arguments or '--help' in args.arguments
    for value in [args.dataset_id, args.run_id]:
        if value and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', value):
            parser.error('IDs must contain 1-100 letters, digits, underscores or hyphens.')
    if not help_only:
        if args.command in ('export', 'train') and not args.dataset_id:
            parser.error('--dataset-id is required for export/train.')
        if args.command != 'export' and not args.run_id:
            parser.error('--run-id is required for this action.')
    for option, key in [('env_file','ML_ENV_FILE'), ('config','ML_CONFIG_FILE'),
                        ('data_root','ML_DATA_ROOT'), ('dataset_id','ML_DATASET_ID'), ('run_id','ML_RUN_ID')]:
        value = getattr(args, option)
        if value is not None:
            os.environ[key] = str(value.resolve() if isinstance(value, Path) else value)
    # Resolve env-file overrides before choosing storage; no numerical modules yet.
    from dotenv import load_dotenv
    ml_dir = Path(__file__).resolve().parents[2]
    load_dotenv(Path(os.environ.get('ML_ENV_FILE', ml_dir / '.env')), override=False)
    if args.command not in ('export', 'train') and not help_only:
        if args.config:
            parser.error('Existing runs use their saved config.toml; --config is only for export/train.')
        root = Path(os.environ.get('ML_DATA_ROOT', ml_dir.parent / 'data'))
        run_dir = root / 'models' / args.run_id
        try:
            metadata = json.loads((run_dir / 'metadata.json').read_text(encoding='utf-8'))
        except FileNotFoundError:
            parser.error(f'Run not found: {args.run_id}. Train it first.')
        dataset_id = metadata['dataset_id']
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', dataset_id):
            parser.error('Invalid dataset ID recorded in run metadata.')
        if args.dataset_id and args.dataset_id != dataset_id:
            parser.error('--dataset-id differs from the dataset recorded in this run.')
        os.environ['ML_DATASET_ID'] = dataset_id
        os.environ['ML_CONFIG_FILE'] = str((run_dir / 'config.toml').resolve())
        os.environ['ML_CONFIG_SNAPSHOT'] = '1'
    try:
        module = importlib.import_module('taoyuan_ml.' + COMMANDS[args.command])
        sys.argv = [f'taoyuan-ml {args.command}', *args.arguments]
        if not help_only:
            from .models.artifacts import prepare_run, verify_run, set_run_status
            if args.command == 'train':
                train_args = module.parse_args()
                from .settings import DATASET_DIR, VARIABLES
                variables = list(VARIABLES) if train_args.all else [train_args.variable]
                for variable in variables:
                    if not (DATASET_DIR / VARIABLES[variable]['parquet']).exists():
                        raise FileNotFoundError(f'Dataset has no exported data for {variable}.')
                prepare_run(variables)
                try:
                    module.main()
                except BaseException:
                    set_run_status('failed')
                    raise
                else:
                    set_run_status('complete')
                return
            elif args.command != 'export':
                verify_run()
        module.main()
    except (FileNotFoundError, FileExistsError, ValueError, RuntimeError, NotImplementedError) as exc:
        parser.exit(1, f'Error: {exc}\n')


if __name__ == '__main__':
    main()
