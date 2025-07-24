'''Combines distinct database models into the KIVZ1978'''

#%% Imports

import sys, os, json, argparse
from copy import deepcopy

import requests

from pathlib import Path

from referencing import Registry, Resource
import jsonschema


#%% Functions

def validate_schema(schema, schema_path):
    '''Validates JSON Schema against provided meta-schema'''
    url = schema.get('$schema', 'https://json-schema.org/draft/2020-12/schema')
    try:
        meta_schema = requests.get(url).json()
        validator_cls = jsonschema.validators.validator_for(meta_schema)
        validator_cls.check_schema(schema)
        print(f'Validated: {schema_path}')
    except Exception as e:
        print(f'Validation failed for {schema_path}: {e}')
        sys.exit()


def load_schemas_from_directory(schemas_dir):
    '''Loads schema files from the given directory'''
    registry = Registry()
    loaded = {}

    for file_path in Path(schemas_dir).glob('*.schema.json'):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                schema = json.load(f)
        except Exception as e:
            print(f'Reading JSON Schema failed for {file_path}: {e}')
            sys.exit()

        uri = schema.get('$id')
        if not uri:
            raise ValueError(f'{file_path} is missing $id.')
        resource = Resource.from_contents(schema)
        registry = registry.with_resource(uri=uri, resource=resource)
        loaded[file_path.name] = (schema, uri, file_path)

    return loaded, registry


def dereference(schema, registry):
    '''Recursively dereferences the given scheme using registry info'''
    def _dereference_node(node):
        if isinstance(node, dict):
            if '$ref' in node:
                ref_uri = node['$ref']
                try:
                    resolved = registry.get(ref_uri).contents
                except Exception as e:
                    raise ValueError(f'Failed to resolve {ref_uri}: {e}')
                return _dereference_node(deepcopy(resolved))
            else:
                return {k: _dereference_node(v) for k, v in node.items()}
        elif isinstance(node, list):
            return [_dereference_node(item) for item in node]
        else:
            return node

    return _dereference_node(schema)


def remove_nested_schemas(node, is_root=True):
    '''Removes excessive $schemas'''
    if isinstance(node, dict):
        if '$schema' in node and not is_root:
            del node['$schema']
        for value in node.values():
            remove_nested_schemas(value, is_root=False)
    elif isinstance(node, list):
        for item in node:
            remove_nested_schemas(item, is_root=False)


def combine_database(root_dir, validate=False):
    '''Main function'''
    root_path = Path(root_dir)
    schemas_path = root_path / 'schemas'
    if not schemas_path.is_dir():
        raise FileNotFoundError(f'No "schemas/" directory in {root_path}')

    root_name = root_path.name
    root_filename = f'{root_name}_root.schema.json'
    root_file_path = schemas_path / root_filename
    if not root_file_path.exists():
        raise FileNotFoundError(f'Expected root schema "{root_filename}" not found in "schemas/"')

    loaded, registry = load_schemas_from_directory(schemas_path)
    if validate:
        for fname, (schema, _, file_path) in loaded.items():
            validate_schema(schema, file_path)

    root_schema, _, _ = loaded[root_filename]
    deref_schema = dereference(root_schema, registry)
    remove_nested_schemas(deref_schema)

    output_file = root_path / f'{root_name}.schema.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(deref_schema, f, indent=2, ensure_ascii=False)

    print(f'Combined {root_name} ...' + ('\n' if validate else ''))



def combine_schemas(root_dir, validate=False):
    
    combined_schema = {
        '$schema': 'https://json-schema.org/draft/2020-12/schema',
        '$id': '/model/kivz_1978',
        'title': 'КИВЦ 1978',
        'description': 'Модель данных компании Татнефть 1978 года',
        'type': 'object',
        'properties': {}
    }
    
    for subdir in os.listdir(root_dir):
        subdir_path = os.path.join(root_dir, subdir)
        if os.path.isdir(subdir_path):
            # regenerate schema
            combine_database(subdir_path, validate)
            # read schema
            schema_file = os.path.join(subdir_path, f'{subdir}.schema.json')
            if os.path.exists(schema_file):
                with open(schema_file, 'r', encoding='utf-8') as f:
                    schema = json.load(f)
                combined_schema['properties'][subdir] = schema
            else:
                print(f'Warning: Schema file not found in {subdir_path}')

    print('\nCombined KIVZ model')

    return combined_schema


#%% Main

if __name__ == '__main__':
    
    # get arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('root_dir', help='Root directory containing database directories')
    parser.add_argument('out_dir', default='./', help='Directory to save combined model')
    parser.add_argument('--validate', default=False, action='store_true', help='Validates tables of distinct databases')
    args = parser.parse_args()
    
    # combine models and save
    combined = combine_schemas(args.root_dir, args.validate)
    path_out = os.path.join(args.out_dir, 'kivz_1978.schema.json')
    with open(path_out, 'w', encoding='utf-8') as outf:
        json.dump(combined, outf, indent=2, ensure_ascii=False)


